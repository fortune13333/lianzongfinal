# routers/topology.py - Network topology discovery and retrieval endpoints.

import logging
from datetime import timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import crud
import models
import services
from auth_deps import get_current_actor, require_permission
from database import get_db

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────

class TopologyLinkOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    source_device_id: str
    source_port: Optional[str]
    target_device_id: str
    target_port: Optional[str]
    target_ip: Optional[str]
    target_platform: Optional[str]
    protocol: str
    discovered_at: Optional[str]


class DiscoverRequest(BaseModel):
    device_ids: Optional[List[str]] = None  # None → discover all managed devices
    simulation: bool = False                 # True → return mock data without SSH


class TopologyResponse(BaseModel):
    nodes: List[dict]
    edges: List[dict]
    last_discovered_at: Optional[str]


# ── Helpers ───────────────────────────────────────────────

def _link_to_edge(link) -> dict:
    return {
        "id": link.id,
        "source": link.source_device_id,
        "target": link.target_device_id,
        "data": {
            "sourcePort": link.source_port,
            "targetPort": link.target_port,
            "targetIp": link.target_ip,
            "targetPlatform": link.target_platform,
            "protocol": link.protocol,
        },
    }


def _build_response(links: list, all_managed_ids: set, extra_node_ids: set = set()) -> TopologyResponse:
    """Convert DB links to React Flow nodes + edges.
    extra_node_ids: device IDs that were successfully reached but had no neighbors,
    so they appear as isolated nodes even without any links.
    """
    node_ids: set = set(extra_node_ids)
    edges = []
    last_dt = None

    for link in links:
        node_ids.add(link.source_device_id)
        node_ids.add(link.target_device_id)
        edges.append(_link_to_edge(link))
        if last_dt is None or link.discovered_at > last_dt:
            last_dt = link.discovered_at

    nodes = []
    for nid in node_ids:
        nodes.append({
            "id": nid,
            "type": "topology",
            "data": {
                "label": nid,
                "managed": nid in all_managed_ids,
            },
            # React Flow layout positions are set client-side
            "position": {"x": 0, "y": 0},
        })

    return TopologyResponse(
        nodes=nodes,
        edges=edges,
        last_discovered_at=last_dt.replace(tzinfo=timezone.utc).isoformat() if last_dt else None,
    )


_SIMULATION_LINKS = [
    {"source_device_id": "RTR01-NYC", "source_port": "GigabitEthernet0/1", "target_device_id": "SW1-NYC",   "target_port": "GigabitEthernet1/0/1", "target_ip": "10.0.0.2", "target_platform": "cisco WS-C3750X", "protocol": "cdp"},
    {"source_device_id": "RTR01-NYC", "source_port": "GigabitEthernet0/2", "target_device_id": "RTR02-LA",  "target_port": "GigabitEthernet0/0", "target_ip": "10.1.0.1", "target_platform": "cisco ISR4431",   "protocol": "cdp"},
    {"source_device_id": "SW1-NYC",   "source_port": "GigabitEthernet1/0/2","target_device_id": "SW2-NYC",  "target_port": "GigabitEthernet1/0/1","target_ip": "10.0.0.3", "target_platform": "cisco WS-C2960",  "protocol": "cdp"},
    {"source_device_id": "RTR02-LA",  "source_port": "GigabitEthernet0/1", "target_device_id": "SW1-LA",   "target_port": "GigabitEthernet0/1",  "target_ip": "10.2.0.2", "target_platform": "cisco WS-C3850",  "protocol": "cdp"},
]


# ── Endpoints ─────────────────────────────────────────────

@router.get("/api/topology", response_model=TopologyResponse)
def get_topology(
    db: Session = Depends(get_db),
    actor: dict = Depends(get_current_actor),
):
    """Return current topology as React Flow nodes + edges."""
    links = crud.get_topology_links(db)
    managed_ids = {d.id for d in db.query(models.Device).all()}
    return _build_response(links, managed_ids)


@router.post("/api/topology/discover")
def discover_topology(
    req: DiscoverRequest,
    db: Session = Depends(get_db),
    actor: str = require_permission("device:view"),
):
    """
    Trigger CDP/LLDP discovery on the specified devices (or all managed devices).
    Returns the updated topology graph.
    """
    managed_ids = {d.id for d in db.query(models.Device).all()}

    # Simulation mode: persist mock links and return immediately
    if req.simulation:
        mock_sources = list({lnk["source_device_id"] for lnk in _SIMULATION_LINKS})
        crud.upsert_topology_links(db, _SIMULATION_LINKS, mock_sources)
        links = crud.get_topology_links(db)
        return _build_response(links, managed_ids)

    all_managed = db.query(models.Device).all()
    target_ids: List[str] = req.device_ids if req.device_ids else [d.id for d in all_managed]
    if not target_ids:
        raise HTTPException(status_code=400, detail="没有可发现的设备")

    all_new_links: list = []
    errors: list = []
    reached_ids: set = set()   # devices that responded, even if 0 neighbors

    for device_id in target_ids:
        try:
            links = services.perform_discover_topology(device_id)
            all_new_links.extend(links)
            reached_ids.add(device_id)
        except HTTPException as exc:
            errors.append({"device_id": device_id, "error": exc.detail})
            logging.warning(f"Topology discovery skipped for '{device_id}': {exc.detail}")

    crud.upsert_topology_links(db, all_new_links, target_ids)
    links = crud.get_topology_links(db)
    response = _build_response(links, managed_ids, extra_node_ids=reached_ids)

    if len(errors) == len(target_ids):
        raise HTTPException(
            status_code=504,
            detail={"message": "所有设备拓扑发现均失败", "errors": errors},
        )

    return {**response.model_dump(), "errors": errors}


@router.delete("/api/topology", status_code=204)
def clear_topology(
    db: Session = Depends(get_db),
    actor: str = require_permission("system:reset"),
):
    """Clear all topology links (requires system:reset permission)."""
    crud.clear_topology(db)
