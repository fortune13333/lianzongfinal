# routers/reports.py - PDF audit and compliance report generation.

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from jinja2 import Environment, FileSystemLoader

import crud
import models
from database import get_db
from auth_deps import require_permission
from license import check_feature

router = APIRouter(tags=["reports"])

_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_template_dir)))
_jinja_env.filters["fromjson"] = json.loads


_PDF_OPTIONS = {
    "encoding": "UTF-8",
    "page-size": "A4",
    "margin-top": "15mm",
    "margin-right": "15mm",
    "margin-bottom": "15mm",
    "margin-left": "15mm",
    "quiet": "",
}

# Windows 默认安装路径；Linux/Docker 通过 PATH 找到即可
_WKHTMLTOPDF_WINDOWS = Path(r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe")


def _get_pdfkit_config():
    import pdfkit
    if _WKHTMLTOPDF_WINDOWS.exists():
        return pdfkit.configuration(wkhtmltopdf=str(_WKHTMLTOPDF_WINDOWS))
    return None  # 让 pdfkit 自行从 PATH 中查找


def _render_pdf(html: str) -> bytes:
    try:
        import pdfkit
        cfg = _get_pdfkit_config()
        result = pdfkit.from_string(html, False, options=_PDF_OPTIONS, configuration=cfg)
        return result if result else b""
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="PDF 生成依赖（pdfkit）未安装，请运行 pip install pdfkit。",
        )
    except OSError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "wkhtmltopdf 未找到。"
                "Windows：请确认已安装 wkhtmltopdf，可执行文件应位于"
                r" C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe；"
                f"Linux：apt-get install wkhtmltopdf。详情：{e}"
            ),
        )


@router.get("/api/report/audit")
def export_audit_report(
    start: str,
    end: str,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Response:
    """导出指定时间范围内的审计日志 PDF 报告。"""
    if not check_feature("pdf_report"):
        raise HTTPException(
            status_code=403,
            detail="PDF 报告导出功能需要专业版或企业版 License，请联系销售升级。"
        )
    logs = crud.get_audit_logs_in_range(db, start, end)
    template = _jinja_env.get_template("report_audit.html")
    html_content = template.render(
        logs=logs,
        start=start,
        end=end,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        generated_by=actor,
    )
    pdf_bytes = _render_pdf(html_content)
    filename = f"audit_report_{start}_{end}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/report/compliance")
def export_compliance_report(
    device_id: str,
    actor: str = require_permission("user:manage"),
    db: Session = Depends(get_db),
) -> Response:
    """导出指定设备的区块链完整性与合规检查 PDF 报告。"""
    if not check_feature("pdf_report"):
        raise HTTPException(
            status_code=403,
            detail="PDF 报告导出功能需要专业版或企业版 License，请联系销售升级。"
        )
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在。")

    blocks = (
        db.query(models.Block)
        .filter(models.Block.device_id == device_id)
        .order_by(models.Block.index)
        .all()
    )

    # Parse block.data JSON for template access
    parsed_blocks = []
    for b in blocks:
        try:
            b._parsed_data = json.loads(str(b.data))
        except Exception:
            b._parsed_data = {}
        parsed_blocks.append(b)

    template = _jinja_env.get_template("report_compliance.html")
    html_content = template.render(
        device=device,
        blocks=parsed_blocks,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        generated_by=actor,
    )
    pdf_bytes = _render_pdf(html_content)
    filename = f"compliance_{device_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
