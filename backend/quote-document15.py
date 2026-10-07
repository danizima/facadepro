#!/usr/bin/env python3
"""Render a validated commercial-offer document from JSON stdin to PDF stdout.

The HTTP boundary validates and calculates the document before invoking this
renderer. No network, dates, generated identifiers, or database reads influence
the output, so identical documents produce identical bytes.
"""

from decimal import Decimal, InvalidOperation
from html import escape
from io import BytesIO
import json
from pathlib import Path
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


FONT_DIRECTORY = Path(__file__).resolve().parent / "fonts"
FONT = "FacadeDejaVu"
BOLD_FONT = "FacadeDejaVuBold"
GRAPHITE = colors.HexColor("#22282E")
MUTED = colors.HexColor("#61707D")
RULE = colors.HexColor("#DCE1E5")
PALE = colors.HexColor("#F4F6F7")
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 42
CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2


def register_fonts():
    """Use bundled Cyrillic fonts, including for every table and page footer."""
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_DIRECTORY / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(BOLD_FONT, str(FONT_DIRECTORY / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD_FONT)


def literal(value):
    """Escape user text before entering ReportLab's XML-like paragraph parser."""
    return escape(str(value or ""), quote=False).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")


def text(value):
    return str(value or "").strip()


def decimal_string(value, minimum_places=0):
    """Format an exact decimal with Russian separators, never binary floats."""
    try:
        number = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("Invalid decimal in commercial-offer document") from error
    if not number.is_finite():
        raise ValueError("Non-finite decimal in commercial-offer document")
    rendered = format(number, "f")
    integral, _, fractional = rendered.partition(".")
    fractional = fractional.rstrip("0").ljust(minimum_places, "0")
    sign = "-" if integral.startswith("-") else ""
    integral = integral.lstrip("-")
    # Reverse the groups, not their characters. This also works for 10-digit sums.
    grouped = sign + " ".join(reversed([integral[max(0, end - 3):end] for end in range(len(integral), 0, -3)]))
    return grouped + ("," + fractional if fractional else "")


def money(kopecks):
    amount = int(kopecks)
    if amount != kopecks:
        raise ValueError("Money totals must use integer kopecks")
    return decimal_string(Decimal(amount) / Decimal(100), 2) + " ₽"


def styles():
    base = {
        "fontName": FONT,
        "fontSize": 9.5,
        "leading": 14,
        "textColor": GRAPHITE,
        "splitLongWords": 1,
        "allowWidows": 0,
        "allowOrphans": 0,
    }
    def style(name, **extra):
        return ParagraphStyle(name, **{**base, **extra})
    return {
        "title": style("QuoteTitle", fontName=BOLD_FONT, fontSize=23, leading=29, spaceAfter=12),
        "subtitle": style("QuoteSubtitle", fontSize=10.5, leading=16, textColor=MUTED, spaceAfter=15),
        "body": style("QuoteBody", spaceAfter=8),
        "label": style("QuoteLabel", fontName=BOLD_FONT, fontSize=11, leading=15, spaceBefore=13, spaceAfter=7, keepWithNext=True),
        "meta": style("QuoteMeta", fontSize=9, leading=13, spaceAfter=3),
        "table": style("QuoteCell", fontSize=8.5, leading=12),
        "number": style("QuoteNumber", fontSize=8.5, leading=12, alignment=TA_RIGHT),
        "header": style("QuoteHeader", fontName=BOLD_FONT, fontSize=7.8, leading=10.5, textColor=colors.white),
        "headerNumber": style("QuoteNumberHeader", fontName=BOLD_FONT, fontSize=7.8, leading=10.5, textColor=colors.white, alignment=TA_RIGHT),
        "totals": style("QuoteTotals", fontSize=9.5, leading=14),
        "totalsNumber": style("QuoteTotalsNumber", fontSize=9.5, leading=14, alignment=TA_RIGHT),
        "grand": style("QuoteGrandTotal", fontName=BOLD_FONT, fontSize=12, leading=17),
        "grandNumber": style("QuoteGrandTotalNumber", fontName=BOLD_FONT, fontSize=12, leading=17, alignment=TA_RIGHT),
        "footer": style("QuoteFooter", fontSize=7, leading=10, textColor=MUTED),
    }


def paragraph(value, style):
    return Paragraph(literal(value), style)


def quantity_paragraph(value, style, width):
    """Keep digit groups together, scaling only unusually large quantities."""
    rendered = decimal_string(value).replace(" ", "\u00a0")
    measured = pdfmetrics.stringWidth(rendered, style.fontName, style.fontSize)
    if measured > width:
        style = ParagraphStyle("QuoteQuantityFit", parent=style, fontSize=max(6, style.fontSize * width / measured * 0.96))
    return paragraph(rendered, style)


def labelled(label, value, style):
    return Paragraph("<b>" + literal(label) + "</b> " + literal(value), style)


def paragraphs(value, style):
    """Leave long notes splittable instead of keeping a whole section together."""
    blocks = re.split(r"\n\s*\n", text(value).replace("\r\n", "\n").replace("\r", "\n"))
    return [paragraph(block, style) for block in blocks if block.strip()]


def tax_caption(tax):
    mode = tax.get("mode", "none")
    rate = decimal_string(tax.get("rate", "0"))
    if mode == "included":
        return "В том числе НДС " + rate + "%"
    if mode == "extra":
        return "НДС " + rate + "% сверх стоимости работ"
    if mode == "none":
        return "Без НДС"
    raise ValueError("Unknown tax mode")


def valid_until_label(value):
    value = text(value)
    # Format ISO dates without a timezone-sensitive datetime conversion.
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
    if match:
        year, month, day = match.groups()
        return f"{day}.{month}.{year}"
    return value


def make_item_table(items, style):
    columns = [24, CONTENT_WIDTH - 24 - 48 - 63 - 92 - 94, 48, 63, 92, 94]
    table_rows = [[
        paragraph("№", style["header"]),
        paragraph("Наименование работ / материалов", style["header"]),
        paragraph("Ед.", style["header"]),
        paragraph("Кол-во", style["headerNumber"]),
        paragraph("Цена за ед., ₽", style["headerNumber"]),
        paragraph("Сумма, ₽", style["headerNumber"]),
    ]]
    for index, item in enumerate(items, 1):
        table_rows.append([
            paragraph(index, style["table"]),
            paragraph(item.get("title", ""), style["table"]),
            paragraph(item.get("unit", ""), style["table"]),
            quantity_paragraph(item["quantity"], style["number"], columns[3] - 12),
            paragraph(decimal_string(item["unitPrice"], 2), style["number"]),
            paragraph(money(item["lineTotalKopecks"])[:-2], style["number"]),
        ])
    table = Table(table_rows, colWidths=columns, repeatRows=1, hAlign="LEFT", splitByRow=1)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), GRAPHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, GRAPHITE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 9),
        ("TOPPADDING", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
    ]))
    return table


def make_totals(document, style):
    totals = document["totals"]
    tax = document.get("tax") or {"mode": "none", "rate": "0"}
    mode = tax.get("mode", "none")
    rows = []
    if mode == "extra":
        rows.append([paragraph("Стоимость без НДС", style["totals"]), paragraph(money(totals["subtotalKopecks"]), style["totalsNumber"])])
    elif mode == "included":
        rows.append([paragraph("Стоимость с НДС", style["totals"]), paragraph(money(totals["subtotalKopecks"]), style["totalsNumber"])])
    rows.append([paragraph(tax_caption(tax), style["totals"]), paragraph(money(totals["taxKopecks"]) if mode != "none" else "", style["totalsNumber"])])
    rows.append([paragraph("ИТОГО", style["grand"]), paragraph(money(totals["totalKopecks"]), style["grandNumber"])])
    table = Table(rows, colWidths=[CONTENT_WIDTH - 188, 188], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, -1), (-1, -1), PALE),
        ("LINEABOVE", (0, -1), (-1, -1), 0.7, GRAPHITE),
    ]))
    return KeepTogether([Spacer(1, 13), table])


def render_pdf(document):
    """Return branded, searchable, deterministic PDF bytes for a document."""
    if not isinstance(document, dict):
        raise ValueError("Commercial-offer document must be an object")
    register_fonts()
    style = styles()
    company = document.get("company") or {}
    customer = document.get("customer") or {}
    title = text(document.get("title")) or "Коммерческое предложение"
    buffer = BytesIO()
    contact = "  /  ".join(text(company.get(key)) for key in ("phone", "email") if text(company.get(key)))
    footer = paragraph(contact, style["footer"]) if contact else None
    footer_height = footer.wrap(CONTENT_WIDTH - 62, PAGE_HEIGHT)[1] if footer else 10
    bottom_margin = max(56, 33 + footer_height)
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=67,
        bottomMargin=bottom_margin,
        pageCompression=1,
        title=title,
        author=text(company.get("legalName")),
        subject="Коммерческое предложение ФАСАД.PRO",
    )

    def page_chrome(pdf_canvas, doc):
        pdf_canvas.saveState()
        pdf_canvas.setTitle(title)
        pdf_canvas.setAuthor(text(company.get("legalName")))
        pdf_canvas.setSubject("Коммерческое предложение ФАСАД.PRO")
        pdf_canvas.setFillColor(GRAPHITE)
        pdf_canvas.setFont(BOLD_FONT, 13)
        pdf_canvas.drawString(MARGIN, PAGE_HEIGHT - 36, "ФАСАД.PRO")
        pdf_canvas.setFillColor(MUTED)
        pdf_canvas.setFont(FONT, 7.5)
        pdf_canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 35, "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ")
        pdf_canvas.setStrokeColor(RULE)
        pdf_canvas.setLineWidth(0.6)
        pdf_canvas.line(MARGIN, PAGE_HEIGHT - 46, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 46)
        pdf_canvas.line(MARGIN, bottom_margin - 12, PAGE_WIDTH - MARGIN, bottom_margin - 12)
        if footer:
            footer.drawOn(pdf_canvas, MARGIN, bottom_margin - 22 - footer_height)
        pdf_canvas.setFont(FONT, 7)
        pdf_canvas.setFillColor(MUTED)
        pdf_canvas.drawRightString(PAGE_WIDTH - MARGIN, bottom_margin - 30, "Страница " + str(doc.page))
        pdf_canvas.restoreState()

    story = [paragraph(title, style["title"])]
    if text(customer.get("reference")):
        story.append(labelled("Заявка:", customer["reference"], style["subtitle"]))

    meta_rows = []
    for label, field in (("Заказчик:", "name"), ("Компания:", "company"), ("Объект:", "object"), ("Город:", "city")):
        if text(customer.get(field)):
            meta_rows.append([labelled(label, customer[field], style["meta"])])
    if meta_rows:
        metadata = Table(meta_rows, colWidths=[CONTENT_WIDTH], hAlign="LEFT")
        metadata.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PALE),
            ("LEFTPADDING", (0, 0), (-1, -1), 11),
            ("RIGHTPADDING", (0, 0), (-1, -1), 11),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.extend([metadata, Spacer(1, 18)])
    else:
        story.append(Spacer(1, 6))

    story.append(make_item_table(document.get("items") or [], style))
    story.append(make_totals(document, style))

    sections = [
        ("Срок выполнения", document.get("timeframe")),
        ("Срок действия предложения", valid_until_label(document.get("validUntil"))),
        ("Условия оплаты", document.get("payment")),
        ("Не включено в стоимость", document.get("exclusions")),
        ("Дополнительные условия", document.get("customerNote")),
    ]
    for label, value in sections:
        if text(value):
            story.append(paragraph(label, style["label"]))
            story.extend(paragraphs(value, style["body"]))

    details = []
    if text(company.get("legalName")):
        details.append(paragraph(company["legalName"], style["body"]))
    requisites = "  /  ".join(label + " " + text(company.get(field)) for label, field in (("ИНН", "inn"), ("КПП", "kpp"), ("ОГРН / ОГРНИП", "ogrn")) if text(company.get(field)))
    if requisites:
        details.append(paragraph(requisites, style["body"]))
    for label, field in (("Телефон:", "phone"), ("Электронная почта:", "email"), ("Менеджер:", "manager"), ("Владивосток:", "vladivostok"), ("Москва:", "moscow")):
        if text(company.get(field)):
            details.append(labelled(label, company[field], style["body"]))
    if details:
        story.append(paragraph("Исполнитель и контакты", style["label"]))
        story.extend(details)

    def deterministic_canvas(*args, **kwargs):
        kwargs["invariant"] = 1
        return canvas.Canvas(*args, **kwargs)

    pdf.build(story, onFirstPage=page_chrome, onLaterPages=page_chrome, canvasmaker=deterministic_canvas)
    return buffer.getvalue()


def main():
    # Stdout must contain PDF only: diagnostics go to stderr on failure.
    try:
        document = json.load(sys.stdin)
        sys.stdout.buffer.write(render_pdf(document))
    except (ValueError, TypeError, KeyError, OSError) as error:
        print("Commercial-offer PDF rendering failed: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
