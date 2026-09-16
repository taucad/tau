from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


INVOICE_NUMBER = "MH-004"
REFERENCE = "MH-140926-01"
OUTPUT = Path(f"/Users/rifont/Documents/SD4/Mangawhai Hills/Billing/Invoice {INVOICE_NUMBER}.pdf")
RATE = Decimal("150.00")
BILLING_BOUNDARY = date(2026, 8, 25)
INVOICE_DATE = date(2026, 9, 14)
DUE_DATE = INVOICE_DATE + timedelta(days=30)
PAGE_W, PAGE_H = A4
LEFT, RIGHT = 72, 552

ITEMS = [
    (
        date(2026, 9, 1),
        Decimal("2.25"),
        "Shared Digital-Twin Planning & Quality Framework",
        "Established the reusable planning and quality framework for producing future Mangawhai Hills lots. "
        "Defined how plans, site information, materials, landscaping and existing models are reviewed and reused; "
        "how incomplete information stays clearly preliminary; how accepted work is protected; and how production "
        "can be handed safely between machines.",
    ),
    (
        date(2026, 9, 3),
        Decimal("2.50"),
        "Lot 45 Model, Site Viewer & Buyer Presentation",
        "Delivered the Lot 45 model and added it to the combined Lot 25 and Lot 45 site viewer without altering "
        "accepted Lot 25 work. Included the house, interiors, access, preliminary garage, finishes, landscaping, "
        "review viewpoints and polished east-alfresco and driveway images, with incomplete design information "
        "clearly identified.",
    ),
    (
        date(2026, 9, 11),
        Decimal("3.25"),
        "Reusable Roof Design & Quality System",
        "Designed, built and validated a reusable roof workflow for current and future lots. Corrected the visible "
        "gaps, overlaps and poor roof relationships found in Lot 45; added repeatable checks for coverage, slopes, "
        "falls and junctions; confirmed both lots from plan and angled views; and delivered verified images and a "
        "documented close-out while protecting accepted Lot 25 work.",
    ),
    (
        date(2026, 9, 11),
        Decimal("0.75"),
        "Lot 25 Design & Presentation Refinements",
        "Completed the requested Lot 25 presentation refinements: removed curtain artefacts, made the furnished "
        "interior visible, corrected the garage roof and recessed gable, extended the driveway continuously to the "
        "road, and removed unwanted gutter and wall lines. Delivered the improved model with verified renders.",
    ),
    (
        date(2026, 9, 11),
        Decimal("2.00"),
        "Simplified Lot Production Workflows",
        "Reduced a complex set of 26 project tools to four clear operator commands for creating lots, modifying "
        "designs, producing renders and getting help. Added automatic quality checks, safe recovery from older "
        "commands and consistent project setup, then validated the complete workflow so a non-technical operator can "
        "receive finished results without managing the underlying production steps.",
    ),
    (
        date(2026, 9, 11),
        Decimal("0.75"),
        "High-Quality Render Workflow",
        "Upgraded the standard render workflow to use the strongest current Lot 25 lighting, materials, viewpoints "
        "and scene presentation. Made polished high-resolution golden-hour output the default, added a faster dry "
        "preview option, and verified the final driveway image retained the current architectural design accurately.",
    ),
    (
        date(2026, 9, 14),
        Decimal("0.50"),
        "Workflow Learning & Operator Help",
        "Created a simple two-step process that lets the operator choose which successful, repeatable improvements "
        "should be remembered for future lot creation, modification or rendering. Updated the help guide so the "
        "feature is easy to find, while preventing one-off design choices and unverified experiments from becoming "
        "permanent project rules.",
    ),
]


def money(value: Decimal) -> str:
    return f"{value:,.2f}"


def duration(hours: Decimal) -> str:
    minutes = int(hours * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d} h"


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if not current or stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def footer(pdf: canvas.Canvas, page_number: int) -> None:
    pdf.setFont("Helvetica", 7.8)
    pdf.drawString(LEFT, 58, "RF")
    pdf.drawString(LEFT, 46, "Richard Fontein")
    pdf.drawString(LEFT, 34, "26 Merfield Street, Auckland 1072")
    pdf.drawString(260, 58, "Mail: richard@fontein.co")
    pdf.drawString(260, 46, "Phone: +64 22 626 9523")
    pdf.drawRightString(RIGHT, 58, "Bank A/C: 06-0185-0142610-00")
    pdf.setFillGray(0.45)
    pdf.drawCentredString(PAGE_W / 2, 22, f"Invoice {INVOICE_NUMBER}  |  Page {page_number}")
    pdf.setFillGray(0)


def table_header(pdf: canvas.Canvas, y: float) -> float:
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(LEFT, y, "Quantity")
    pdf.drawString(142, y, "Description")
    pdf.drawRightString(460, y, "Unit price")
    pdf.drawRightString(RIGHT, y, "Price")
    pdf.setLineWidth(0.55)
    pdf.line(LEFT, y - 9, RIGHT, y - 9)
    return y - 29


def continuation_header(pdf: canvas.Canvas, page_number: int) -> float:
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(LEFT, 794, f"Invoice {INVOICE_NUMBER} - continued")
    pdf.setFont("Helvetica", 8.5)
    pdf.drawRightString(RIGHT, 794, "Mangawhai Hills Limited")
    pdf.setLineWidth(0.55)
    pdf.line(LEFT, 782, RIGHT, 782)
    return table_header(pdf, 758)


def build() -> None:
    total_hours = sum((item[1] for item in ITEMS), Decimal("0"))
    total = sum((item[1] * RATE for item in ITEMS), Decimal("0"))
    assert all(item[0] > BILLING_BOUNDARY for item in ITEMS)
    assert total_hours == Decimal("12.00")
    assert total == Decimal("1800.00")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4)
    pdf.setTitle(f"Invoice {INVOICE_NUMBER}")
    pdf.setAuthor("Richard Fontein")

    page_number = 1
    pdf.setLineWidth(0.55)
    pdf.line(LEFT, 712, 300, 712)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(186, 700, "RF, 26 Merfield Street, 1072 Auckland")

    pdf.setFont("Helvetica", 10)
    for index, line in enumerate(
        ["Mangawhai Hills Limited", "Patrick Fontein", "19/67 Sarsfield Street", "Auckland", "Auckland 1011"]
    ):
        pdf.drawString(LEFT, 670 - index * 13, line)

    labels = [(LEFT, "Invoice", INVOICE_NUMBER), (205, "Reference", REFERENCE), (345, "Due", DUE_DATE.strftime("%d/%m/%Y")), (465, "Invoice Date", INVOICE_DATE.strftime("%d/%m/%Y"))]
    for x, label, value in labels:
        pdf.setFont("Helvetica", 8.5)
        pdf.drawString(x, 542, label)
        pdf.setFont("Helvetica", 9.5)
        pdf.drawString(x, 529, value)

    pdf.setFont("Helvetica", 9)
    pdf.drawString(LEFT, 486, "Mangawhai Hills professional services completed after MH-003, from 1 to 14 September 2026.")
    pdf.drawString(LEFT, 469, "No GST charged. Richard Fontein is not registered for GST.")
    pdf.line(LEFT, 459, RIGHT, 459)
    y = table_header(pdf, 444)

    for item_date, hours, title, description in ITEMS:
        lines = wrap(description, "Helvetica-Oblique", 8.2, 248)
        row_height = max(42, 15 + len(lines) * 9.4 + 12)
        if y - row_height < 82:
            footer(pdf, page_number)
            pdf.showPage()
            page_number += 1
            y = continuation_header(pdf, page_number)

        amount = hours * RATE
        pdf.setFont("Helvetica", 8.6)
        pdf.drawString(LEFT, y, duration(hours))
        pdf.drawString(LEFT, y - 12, item_date.strftime("%d/%m/%Y"))

        pdf.setFont("Helvetica-Bold", 8.6)
        pdf.drawString(142, y, title)
        pdf.setFont("Helvetica-Oblique", 8.2)
        line_y = y - 12
        for line in lines:
            pdf.drawString(142, line_y, line)
            line_y -= 9.4

        pdf.setFont("Helvetica", 8.6)
        pdf.drawRightString(460, y, money(RATE))
        pdf.drawRightString(RIGHT, y, money(amount))
        y -= row_height

    if y < 150:
        footer(pdf, page_number)
        pdf.showPage()
        page_number += 1
        y = continuation_header(pdf, page_number)

    pdf.line(350, y + 9, RIGHT, y + 9)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(350, y - 8, "Total")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(400, y - 8, duration(total_hours))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(RIGHT, y - 8, f"NZD {money(total)}")

    pdf.setFont("Helvetica", 8.5)
    note = (
        f"Payment of NZD {money(total)} is due by {DUE_DATE.strftime('%d/%m/%Y')} by direct credit "
        f"to RF bank account 06-0185-0142610-00. Please use {INVOICE_NUMBER} as the payment reference."
    )
    note_y = y - 38
    for line in wrap(note, "Helvetica", 8.5, RIGHT - LEFT):
        pdf.drawString(LEFT, note_y, line)
        note_y -= 11

    footer(pdf, page_number)
    pdf.save()


if __name__ == "__main__":
    build()
