#!/usr/bin/env python3
"""
Profile the Amazon Products Dataset CSV before ingestion.

Usage:
    python scripts/inspect_amazon.py [--csv PATH] [--sample N]

Writes data/inspection_notes.md with column names, null rates,
category histogram, asin uniqueness, and price distribution.
Run this BEFORE ingest_amazon.py to verify the CSV shape.
"""

import argparse
import os
import sys

try:
    import pandas as pd
except ImportError:
    print("pandas not installed — run: pip install pandas")
    sys.exit(1)

DEFAULT_CSV = "data/raw/amazon_products_2023.csv"
SAMPLE_ROWS = 200_000
OUT_FILE = "data/inspection_notes.md"


def _null_rate(series: "pd.Series") -> str:
    pct = series.isna().mean() * 100
    return f"{pct:.1f}%"


def inspect(csv_path: str, sample_rows: int) -> None:
    print(f"[inspect] Reading sample ({sample_rows:,} rows) from {csv_path} ...")
    try:
        sample = pd.read_csv(csv_path, nrows=sample_rows, low_memory=False)
    except FileNotFoundError:
        print(f"[inspect] ERROR: {csv_path} not found.")
        print("  Download it with: kaggle datasets download -d asaniczka/amazon-products-dataset-2023-1-4m-products")
        print("  Then unzip into data/raw/amazon_products_2023.csv")
        sys.exit(1)

    cols = list(sample.columns)
    print(f"[inspect] Columns ({len(cols)}): {cols}")

    lines = ["# Amazon Products Dataset — Inspection Notes", ""]
    lines += [f"CSV: `{csv_path}`", f"Sample size: {sample_rows:,} rows", ""]

    # Columns
    lines += ["## Columns", ""]
    lines += [f"Total columns: {len(cols)}", ""]
    lines += ["```", ", ".join(cols), "```", ""]

    # Null rates
    lines += ["## Null rates (sample)", ""]
    lines += ["| Column | Null % |", "|--------|--------|"]
    for col in cols:
        lines.append(f"| {col} | {_null_rate(sample[col])} |")
    lines.append("")

    # ASIN uniqueness
    if "asin" in sample.columns:
        total = len(sample)
        unique = sample["asin"].nunique()
        dups = total - unique
        lines += ["## ASIN uniqueness (sample)", ""]
        lines += [f"- Total rows: {total:,}", f"- Unique ASINs: {unique:,}", f"- Duplicates: {dups:,}", ""]
    else:
        lines += ["## ASIN", "", "⚠ `asin` column not found — check column names above.", ""]

    # Category histogram
    cat_col = next((c for c in cols if "category" in c.lower() and "name" in c.lower()), None)
    cat_col = cat_col or next((c for c in cols if "category" in c.lower()), None)
    if cat_col:
        lines += [f"## Category histogram (`{cat_col}`) — top 60", ""]
        counts = sample[cat_col].value_counts().head(60)
        lines += ["| categoryName | Count |", "|---|---|"]
        for name, cnt in counts.items():
            lines.append(f"| {name} | {cnt:,} |")
        lines.append("")
    else:
        lines += ["## Category", "", "⚠ No category column found.", ""]

    # Price distribution
    price_col = next((c for c in cols if c.lower() == "price"), None)
    if price_col:
        pr = sample[price_col].dropna()
        lines += ["## Price distribution (USD, non-null sample)", ""]
        lines += [
            f"- min: ${pr.min():.2f}",
            f"- p1: ${pr.quantile(0.01):.2f}",
            f"- p50: ${pr.quantile(0.50):.2f}",
            f"- p99: ${pr.quantile(0.99):.2f}",
            f"- max: ${pr.max():.2f}",
            f"- null rows: {sample[price_col].isna().sum():,} / {len(sample):,}",
            "",
        ]

    # Best seller
    bs_col = next((c for c in cols if "bestseller" in c.lower() or "best_seller" in c.lower()), None)
    if bs_col:
        n_bs = sample[bs_col].sum() if sample[bs_col].dtype in ("bool", "int64") else (sample[bs_col] == True).sum()
        lines += ["## Best sellers (sample)", "", f"{n_bs:,} rows have isBestSeller=True", ""]

    # Recommendations for ingestion
    lines += ["## Category → Pactum mapping notes", ""]
    lines += ["Map these `categoryName` values to Pactum categories (gpu/chair/sensor/laptop/server/electronics/general):", ""]
    lines += ["Update `scripts/ingest_amazon.py` CATEGORY_MAP if the categories below differ from defaults.", ""]

    notes_path = os.path.join(os.path.dirname(__file__), "..", OUT_FILE)
    notes_path = os.path.normpath(notes_path)
    with open(notes_path, "w") as f:
        f.write("\n".join(lines))

    print(f"[inspect] Written to {notes_path}")
    print(f"[inspect] IMPORTANT: review {OUT_FILE} and update CATEGORY_MAP in ingest_amazon.py before running ingestion.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to CSV file")
    parser.add_argument("--sample", type=int, default=SAMPLE_ROWS, help="Rows to sample")
    args = parser.parse_args()
    inspect(args.csv, args.sample)


if __name__ == "__main__":
    main()
