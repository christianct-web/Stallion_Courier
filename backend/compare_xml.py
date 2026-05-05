#!/usr/bin/env python3
import requests
import xml.etree.ElementTree as ET

payload = {
    "header": {
        "consignorName": "CENTRAL INTERNATIONAL CO .LLC",
        "consignorAddress": "ONE WHITMAN ROAD, P.O BOX 525, CANTON, MASSACHUSETTS, U.S.A",
        "invoiceNumber": "446506",
        "invoiceDate": "2023-07-25",
        "consigneeCode": "N108974",
        "consigneeName": "BASCO FOOD DISTRIBUTORS LTD",
        "consigneeAddress": "#31 HENRY STREET, GASPARILLO",
        "declarantTIN": "BR0286",
        "declarantName": "ANTHONY CHOW",
        "declarantAddress": "1, ZEV BEN ELIAZER ST., D/MARTIN",
        "port": "TTPTS",
        "term": "CIF",
        "modeOfTransport": "1",
        "customsRegime": "C4",
        "declarationRef": "LB01/23",
        "countryFirstDestination": "US",
        "tradingCountry": "US",
        "exportCountryCode": "US",
        "exportCountryName": "United States",
        "countryOfOriginName": "United States",
        "blAwbNumber": "TSCW16401583",
        "blAwbDate": "2023-07-29",
        "etaDate": "2023-08-02",
        "currency": "TTD",
        "vesselName": "TROPIC ISLAND",
        "bankCode": "01",
        "modeOfPayment": "CASH",
        "termsCode": "01",
        "termsDescription": "Basic",
        "totalPackages": 1394,
    },
    "worksheet": {
        "fob_foreign": 60220.80,
        "freight_foreign": 0.00,
        "insurance_foreign": 0.00,
        "other_foreign": 0.00,
        "deduction_foreign": 0.00,
        "cif_foreign": 60220.80,
        "cif_local": 408060.96,
        "exchange_rate": 6.776080,
        "duty_rate_pct": 40.0,
        "surcharge_rate_pct": 15.0,
        "vat_rate_pct": 0.0,
        "duty": 163224.38,
        "surcharge": 61209.14,
        "vat": 0.00,
        "cf2_fee": 525.00,
        "customs_user_fee": 40.00,
        "total_assessed": 224998.52,
        "grossWeight": 26245.00,
    },
    "items": [
        {
            "hsCode": "02071490000",
            "description": "OTHER CUTS & OFFAL OF FOWLS OF THE SPECIES GALLUS DOMESTICUS, BONELESS SKINLESS CHICKEN BREAST FILETS",
            "itemValue": 408060.96,
            "qty": 1394,
            "grossKg": 26245.00,
            "netKg": 23620.50,
            "packageType": "CT",
            "packageTypeName": "Carton",
            "countryOfOrigin": "US",
            "marks1": "AS ADDRESSED",
            "blAwbNumber": "TSCW16401583",
            "extendedCustomsProcedure": 4000,
            "nationalCustomsProcedure": 0,
            "quotaCode": "NEW",
            "valuationMethodCode": "",
            "rateOfAdjustment": 1.0,
            "aiCode": "705",
            "supplierDocumentType": "IV05",
            "statisticalValue": 408060.96,
            "itemValueLocal": 408060.96,
            "currency": "TTD",
            "exchangeRate": 1.0,
        }
    ],
    "containers": [],
}

response = requests.post("http://localhost:8021/pack/generate", json=payload, timeout=30)
result = response.json()

if result.get("status") != "generated":
    print("Generation failed:", result)
    raise SystemExit(1)

xml_doc = next((d for d in result.get("documents", []) if d.get("name") == "c82_sad_xml"), None)
if not xml_doc:
    print("No XML document generated")
    raise SystemExit(1)

xml_resp = requests.get(f"http://localhost:8021{xml_doc['url']}", timeout=10)
root = ET.fromstring(xml_resp.text)

print("=== LB01/23 XML Parity Checks ===")

required_top = [
    "Assessment_notice",
    "Global_taxes",
    "Property",
    "Identification",
    "Traders",
    "Declarant",
    "General_information",
    "Transport",
    "Financial",
    "Warehouse",
    "Transit",
    "Valuation",
    "Item",
    "Suppliers_documents",
]

present = {c.tag for c in root}
missing = [t for t in required_top if t not in present]
if missing:
    print("Missing top-level sections:")
    for m in missing:
        print(" -", m)
else:
    print("Top-level sections: OK")

warehouse = root.find("Warehouse")
transit = root.find("Transit")
sup_docs = root.find("Suppliers_documents")
print("Warehouse stub:", "OK" if warehouse is not None else "MISSING")
print("Transit stub:", "OK" if transit is not None else "MISSING")
print("Suppliers_documents:", "OK" if sup_docs is not None else "MISSING")

valuation = root.find("Valuation")
gs_count = 0
if valuation is not None:
    gs_count = len([e for e in valuation if e.tag.startswith("Gs_")])
print(f"Valuation Gs_* count: {gs_count}")

items = root.findall("Item")
if not items:
    print("Items: MISSING")
else:
    print(f"Items count: {len(items)}")
    first_item = items[0]
    item_gs = len([e for e in first_item if e.tag.startswith("Gs_")])
    print(f"Item-level Gs_* count: {item_gs}")

property_elem = root.find("Property")
if property_elem is not None:
    nbers = property_elem.find("Nbers")
    pkg = nbers.find("Total_number_of_packages") if nbers is not None else None
    print("Header packages:", pkg.text if pkg is not None else "MISSING")

print("=== Done ===")
