from __future__ import annotations

import itertools
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
THRESHOLD_FIELDS = [
    "Heat",
    "Pressure",
    "Humidity",
    "Density",
    "Conductivity",
    "Distortion",
]
REQ_THRESHOLD_FIELDS = [f"Req_{name}" for name in THRESHOLD_FIELDS]


@dataclass
class WorkbookData:
    elements: list[dict[str, Any]]
    offensive: list[dict[str, Any]]
    protective: list[dict[str, Any]]
    utility: list[dict[str, Any]]


def _col_to_idx(col: str) -> int:
    value = 0
    for ch in col:
        if ch.isalpha():
            value = value * 26 + (ord(ch.upper()) - 64)
    return value - 1


def _normalize_value(value: str) -> Any:
    if value is None:
        return ""
    value = str(value).strip()
    if value == "":
        return ""
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def _read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for si in root.findall(f"{NS}si"):
        plain = si.find(f"{NS}t")
        if plain is not None:
            strings.append(plain.text or "")
            continue
        chunks: list[str] = []
        for run in si.findall(f"{NS}r"):
            tnode = run.find(f"{NS}t")
            if tnode is not None:
                chunks.append(tnode.text or "")
        strings.append("".join(chunks))
    return strings


def _sheet_rows(zf: zipfile.ZipFile, sheet_xml_path: str, shared_strings: list[str]) -> list[list[Any]]:
    root = ET.fromstring(zf.read(sheet_xml_path))
    rows: list[list[Any]] = []
    for row in root.findall(f".//{NS}sheetData/{NS}row"):
        values: dict[int, Any] = {}
        for cell in row.findall(f"{NS}c"):
            ref = cell.attrib.get("r", "A1")
            col = "".join(ch for ch in ref if ch.isalpha())
            idx = _col_to_idx(col)
            cell_type = cell.attrib.get("t")

            if cell_type == "s":
                vnode = cell.find(f"{NS}v")
                value = shared_strings[int(vnode.text)] if vnode is not None and vnode.text else ""
            elif cell_type == "inlineStr":
                inode = cell.find(f"{NS}is/{NS}t")
                value = inode.text if inode is not None and inode.text else ""
            else:
                vnode = cell.find(f"{NS}v")
                value = vnode.text if vnode is not None and vnode.text else ""

            values[idx] = _normalize_value(value)

        if values:
            max_idx = max(values)
            rows.append([values.get(i, "") for i in range(max_idx + 1)])
    return rows


def _rows_to_dicts(rows: list[list[Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    headers = [str(h).strip() for h in rows[0]]
    out: list[dict[str, Any]] = []
    for row in rows[1:]:
        item = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
        if item.get("RowName"):
            out.append(item)
    return out


def load_workbook_data(xlsx_path: str | Path) -> WorkbookData:
    with zipfile.ZipFile(xlsx_path) as zf:
        shared_strings = _read_shared_strings(zf)
        sheets = {
            "elements": "xl/worksheets/sheet1.xml",
            "offensive": "xl/worksheets/sheet2.xml",
            "protective": "xl/worksheets/sheet3.xml",
            "utility": "xl/worksheets/sheet4.xml",
        }
        parsed = {
            key: _rows_to_dicts(_sheet_rows(zf, sheet_xml, shared_strings))
            for key, sheet_xml in sheets.items()
        }

    return WorkbookData(
        elements=parsed["elements"],
        offensive=parsed["offensive"],
        protective=parsed["protective"],
        utility=parsed["utility"],
    )


def _to_float(value: Any) -> float:
    if value in ("", None):
        return 0.0
    return float(value)


def _required_elements(raw: Any) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in str(raw).split(",") if p.strip()]


def evaluate_combinations(data: WorkbookData) -> dict[str, Any]:
    element_names = [e["RowName"] for e in data.elements]
    element_map = {e["RowName"]: e for e in data.elements}

    all_combos: list[dict[str, Any]] = []
    phenomenon_hits: dict[str, int] = {}

    for size in range(1, len(element_names) + 1):
        for combo in itertools.combinations(element_names, size):
            combo_set = set(combo)
            totals = {field: 0.0 for field in THRESHOLD_FIELDS}
            for element_name in combo:
                element = element_map[element_name]
                for field in THRESHOLD_FIELDS:
                    totals[field] += _to_float(element.get(field))

            offensive_matches = []
            for ph in data.offensive:
                ok = True
                for req_field, field in zip(REQ_THRESHOLD_FIELDS, THRESHOLD_FIELDS):
                    req = _to_float(ph.get(req_field))
                    if req > 0 and totals[field] < req:
                        ok = False
                        break
                if ok:
                    offensive_matches.append(ph)

            protective_matches = [
                ph
                for ph in data.protective
                if set(_required_elements(ph.get("RequiredElements"))).issubset(combo_set)
            ]
            utility_matches = [
                ph
                for ph in data.utility
                if set(_required_elements(ph.get("RequiredElements"))).issubset(combo_set)
            ]

            for ph in offensive_matches + protective_matches + utility_matches:
                phenomenon_hits[ph["PhenomenonID"]] = phenomenon_hits.get(ph["PhenomenonID"], 0) + 1

            conflicts: list[str] = []
            for cat_name, matches in [
                ("Offensive", offensive_matches),
                ("Protective", protective_matches),
                ("Utility", utility_matches),
            ]:
                if len(matches) > 1:
                    top_priority = max(_to_float(m.get("Priority")) for m in matches)
                    top = [m for m in matches if _to_float(m.get("Priority")) == top_priority]
                    if len(top) > 1:
                        conflicts.append(
                            f"{cat_name}: {len(top)} fenômenos empatados na maior prioridade ({top_priority})."
                        )

            all_combos.append(
                {
                    "combo": list(combo),
                    "totals": totals,
                    "offensive": [m["DisplayName"] for m in offensive_matches],
                    "protective": [m["DisplayName"] for m in protective_matches],
                    "utility": [m["DisplayName"] for m in utility_matches],
                    "conflicts": conflicts,
                }
            )

    all_phenomena = data.offensive + data.protective + data.utility
    unreachable = [
        {
            "id": ph["PhenomenonID"],
            "name": ph["DisplayName"],
            "category": (
                "Offensive"
                if ph in data.offensive
                else "Protective"
                if ph in data.protective
                else "Utility"
            ),
        }
        for ph in all_phenomena
        if ph.get("PhenomenonID") not in phenomenon_hits
    ]

    conflicted = [c for c in all_combos if c["conflicts"]]

    return {
        "summary": {
            "elements": len(data.elements),
            "offensive": len(data.offensive),
            "protective": len(data.protective),
            "utility": len(data.utility),
            "total_combinations": len(all_combos),
            "conflicted_combinations": len(conflicted),
            "unreachable_phenomena": len(unreachable),
        },
        "elements": data.elements,
        "offensive": data.offensive,
        "protective": data.protective,
        "utility": data.utility,
        "combinations": all_combos,
        "conflicted_combinations": conflicted,
        "unreachable_phenomena": unreachable,
    }


def build_report(xlsx_path: str | Path) -> dict[str, Any]:
    data = load_workbook_data(xlsx_path)
    return evaluate_combinations(data)


def write_report(xlsx_path: str | Path, output_json_path: str | Path) -> Path:
    report = build_report(xlsx_path)
    output_path = Path(output_json_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path
