# api_routes.py - Thin aggregator: includes all domain routers.
# Business logic lives in routers/ and services.py — not here.

from fastapi import APIRouter

from routers import auth, devices, blockchain, templates, scripts, tasks, admin

router = APIRouter()

router.include_router(auth.router)
router.include_router(devices.router)
router.include_router(blockchain.router)
router.include_router(templates.router)
router.include_router(scripts.router)
router.include_router(tasks.router)
router.include_router(admin.router)
