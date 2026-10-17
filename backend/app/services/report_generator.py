import os
import json
from datetime import datetime

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

from app.config import UPLOAD_DIR, REPORTS_DIR
from app.services.profiling import profile_dataset
from app.services.quality import score_dataset
from app.services.preprocessing import preprocess_dataset

os.makedirs(REPORTS_DIR, exist_ok=True)


def generate_recommendations(profile: dict, quality_before: dict, quality_after: dict) -> list:
    recs   = []

    if profile["missing_values"]["total_missing"] > 0:
        recs.append("Missing values were imputed using KNN (numerical) and Most-Frequent (categorical) strategies.")
    else:
        recs.append("No missing values detected. Dataset is complete.")

    if profile["duplicates"]["duplicate_rows"] > 0:
        recs.append(f"{profile['duplicates']['duplicate_rows']} duplicate rows were removed to ensure data integrity.")
    else:
        recs.append("No duplicate rows found.")

    if quality_after["individual_scores"]["validity"] < 100:
        recs.append("Extreme outlier values were clipped or removed using IQR and Isolation Forest methods.")

    if quality_after["overall_score"] >= 90:
        recs.append("Overall data quality is Excellent. Dataset is ready for ML pipelines.")
    elif quality_after["overall_score"] >= 75:
        recs.append("Overall data quality is Good. Dataset can be used for model training.")
    else:
        recs.append("Data quality needs further review. Inspect flagged columns before training.")

    imp = round(quality_after["overall_score"] - quality_before["overall_score"], 2)
    if imp > 0:
        recs.append(f"Quality score improved by {imp}% after preprocessing.")

    return recs


def _make_table(data, highlight_last=False):
    col_count = len(data[0])
    col_width = 15 * cm / col_count
    table     = Table(data, colWidths=[col_width] * col_count)
    style     = [
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#16213e")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f5f5f5"), colors.white]),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if highlight_last:
        style += [
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8f5e9")),
            ("FONTNAME",   (0, -1), (-1, -1), "Helvetica-Bold"),
        ]
    table.setStyle(TableStyle(style))
    return table


def build_pdf(filename, profile, quality_before, quality_after, repair_log, recommendations, pdf_path):
    doc     = SimpleDocTemplate(pdf_path, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm,   bottomMargin=2*cm)
    title   = ParagraphStyle("T", fontSize=18, spaceAfter=6,
                              textColor=colors.HexColor("#1a1a2e"), fontName="Helvetica-Bold")
    heading = ParagraphStyle("H", fontSize=13, spaceAfter=4, spaceBefore=10,
                              textColor=colors.HexColor("#16213e"), fontName="Helvetica-Bold")
    body    = ParagraphStyle("B", fontSize=10, spaceAfter=4,
                              textColor=colors.HexColor("#333333"), fontName="Helvetica")
    sub     = ParagraphStyle("S", fontSize=9,  spaceAfter=2,
                              textColor=colors.HexColor("#555555"), fontName="Helvetica")

    c = []
    c.append(Paragraph("Dataset Quality Report", title))
    c.append(Paragraph(f"File: {filename}", body))
    c.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", sub))
    c.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
    c.append(Spacer(1, 0.3*cm))

    # 1. Dataset Summary
    basic = profile["basic_info"]
    c.append(Paragraph("1. Dataset Summary", heading))
    c.append(_make_table([
        ["Metric", "Value"],
        ["Rows",               str(basic["rows"])],
        ["Columns",            str(basic["columns"])],
        ["Memory Usage",       f"{basic['memory_usage_kb']} KB"],
        ["Numerical Columns",  ", ".join(basic["numerical_columns"]) or "None"],
        ["Categorical Columns",", ".join(basic["categorical_columns"]) or "None"],
    ]))
    c.append(Spacer(1, 0.3*cm))

    # 2. Issues Found
    miss  = profile["missing_values"]
    dupes = profile["duplicates"]
    c.append(Paragraph("2. Issues Found", heading))
    c.append(_make_table([
        ["Issue",            "Count",                        "Percentage"],
        ["Missing Values",   str(miss["total_missing"]),     f"{miss['total_missing_percent']}%"],
        ["Duplicate Rows",   str(dupes["duplicate_rows"]),   f"{dupes['duplicate_percent']}%"],
        ["Outlier Entries",  str(quality_before["details"]["validity"].get("invalid_entries", 0)), "-"],
        ["Type Issues",      str(quality_before["details"]["consistency"]["failed_checks"]), "-"],
    ]))
    c.append(Spacer(1, 0.3*cm))

    # 3. Repair Log
    c.append(Paragraph("3. Issues Fixed", heading))
    m   = repair_log.get("missing_values", {})
    d   = repair_log.get("duplicates", {})
    o   = repair_log.get("outliers", {})
    lv  = repair_log.get("low_variance", {})
    dc  = repair_log.get("duplicate_columns", {})
    lb  = repair_log.get("label_errors", {})

    strategy = o.get("strategy", "clip")
    if strategy == "clip":
        outlier_count = o.get("total_values_clipped", 0)
    elif strategy == "remove":
        outlier_count = o.get("rows_removed", 0)
    else:
        outlier_count = o.get("outliers_flagged", 0)

    redundant_removed = (
        len(lv.get("constant_columns_dropped", [])) +
        len(lv.get("near_constant_dropped", [])) +
        len(dc.get("duplicate_columns_dropped", []))
    )

    c.append(_make_table([
        ["Module",                    "Result"],
        ["Missing (Numerical)",        ", ".join(m.get("numerical_imputed", [])) or "None"],
        ["Missing (Categorical)",      ", ".join(m.get("categorical_imputed", [])) or "None"],
        ["Duplicates Removed",         str(d.get("duplicates_removed", 0))],
        ["Outliers",                   f"{outlier_count} ({strategy})"],
        ["Redundant Columns Removed",  str(redundant_removed)],
        ["Label Errors Found",         str(lb.get("label_errors_found", 0))],
    ]))
    c.append(Spacer(1, 0.3*cm))

    # 4. Quality Score
    c.append(Paragraph("4. Quality Score", heading))
    bi = quality_before["individual_scores"]
    ai = quality_after["individual_scores"]
    c.append(_make_table([
        ["Metric",         "Before",                        "After"],
        ["Completeness",   f"{bi['completeness']}%",        f"{ai['completeness']}%"],
        ["Uniqueness",     f"{bi['uniqueness']}%",          f"{ai['uniqueness']}%"],
        ["Validity",       f"{bi['validity']}%",            f"{ai['validity']}%"],
        ["Consistency",    f"{bi['consistency']}%",         f"{ai['consistency']}%"],
        ["Overall Score",  f"{quality_before['overall_score']}%", f"{quality_after['overall_score']}%"],
        ["Grade",          quality_before['grade'],         quality_after['grade']],
    ], highlight_last=True))
    c.append(Spacer(1, 0.3*cm))

    # 5. Recommendations
    c.append(Paragraph("5. Recommendations", heading))
    for i, rec in enumerate(recommendations, 1):
        c.append(Paragraph(f"{i}. {rec}", body))

    c.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
    c.append(Paragraph("Generated by Dataset Repair Platform — MLOps Project", sub))
    doc.build(c)


def generate_report(filename: str, repair_log: dict = None) -> dict:
    filepath     = os.path.join(UPLOAD_DIR, filename)
    base         = os.path.splitext(filename)[0]
    cleaned_path = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
    pdf_path     = os.path.join(REPORTS_DIR, f"{base}_report.pdf")
    json_path    = os.path.join(REPORTS_DIR, f"{base}_summary.json")

    # Run repair only if cleaned file doesn't exist yet
    if repair_log is None:
        if not os.path.exists(cleaned_path):
            result     = preprocess_dataset(filepath)
            result.pop("_fitted_models", None)
            repair_log = result["audit"]
        else:
            repair_log = {}

    profile        = profile_dataset(filepath)
    quality_before = score_dataset(filepath)
    quality_after  = score_dataset(cleaned_path)
    recommendations = generate_recommendations(profile, quality_before, quality_after)

    build_pdf(filename, profile, quality_before, quality_after,
              repair_log, recommendations, pdf_path)

    summary = {
        "generated_at":    datetime.now().isoformat(),
        "filename":        filename,
        "dataset_summary": {
            "rows":                profile["basic_info"]["rows"],
            "columns":             profile["basic_info"]["columns"],
            "memory_usage_kb":     profile["basic_info"]["memory_usage_kb"],
            "numerical_columns":   profile["basic_info"]["numerical_columns"],
            "categorical_columns": profile["basic_info"]["categorical_columns"],
        },
        "issues_found": {
            "total_missing":  profile["missing_values"]["total_missing"],
            "duplicate_rows": profile["duplicates"]["duplicate_rows"],
            "invalid_entries": quality_before["details"]["validity"]["invalid_entries"],
            "type_issues":    quality_before["details"]["consistency"]["failed_checks"],
        },
        "repair_log":     repair_log,
        "quality_before": {**quality_before["individual_scores"],
                           "overall": quality_before["overall_score"],
                           "grade":   quality_before["grade"]},
        "quality_after":  {**quality_after["individual_scores"],
                           "overall": quality_after["overall_score"],
                           "grade":   quality_after["grade"]},
        "improvement":    round(quality_after["overall_score"] - quality_before["overall_score"], 2),
        "recommendations": recommendations,
    }

    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2)

    return {
        "status":          "Report generated successfully",
        "pdf_report":      pdf_path,
        "summary_json":    json_path,
        "cleaned_dataset": cleaned_path,
        "quality_before":  quality_before["overall_score"],
        "quality_after":   quality_after["overall_score"],
        "improvement":     summary["improvement"],
        "recommendations": recommendations,
    }
