#!/usr/bin/env python3
import json
import requests
import sys

# Real cleared declaration fixture: LB01/23 (A 46631)
payload = {
    "header": {
        "consignorName": "CENTRAL INTERNATIONAL CO .LLC",
        "consignorAddress": "ONE WHITMAN ROAD, P.O BOX 525, CANTON, MASSACHUSETTS, U.S.A",
        "consignorStreet": "ONE WHITMAN ROAD",
        "consignorCity": "CANTON, MASSACHUSETTS",
        "consignorCountry": "United States",
        "invoiceNumber": "446506",
        "invoiceDate": "2023-07-25",
        "consigneeCode": "N108974",
        "consigneeName": "BASCO FOOD DISTRIBUTORS LTD",
        "consigneeAddress": "#31 HENRY STREET, GASPARILLO",
        "port": "TTPTS",
        "modeOfTransport": "1",
        "term": "CIF",
        "customsRegime": "C4",
        "declarantTIN": "BR0286",
        "declarantName": "ANTHONY CHOW",
        "declarantAddress": "1, ZEV BEN ELIAZER ST., D/MARTIN",
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
        "totalPackages": 1394
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
        "extra_fees_local": 0.00,
        "duty": 163224.38,
        "surcharge": 61209.14,
        "vat": 0.00,
        "cf2_fee": 525.00,
        "customs_user_fee": 40.00,
        "ces_fees": 0.00,
        "total_assessed": 224998.52,
        "grossWeight": 26245.00
    },
    "items": [
        {
            "hsCode": "02071490000",
            "description": "OTHER CUTS & OFFAL OF FOWLS OF THE SPECIES GALLUS DOMESTICUS, BONELESS SKINLESS CHICKEN BREAST FILETS",
            "itemValue": 408060.96,
            "qty": 1394,
            "grossKg": 26245.0,
            "netKg": 23620.5,
            "packageType": "CT",
            "packageTypeName": "Carton",
            "countryOfOrigin": "US",
            "marks1": "AS ADDRESSED",
            "blAwbNumber": "TSCW16401583",
            "extendedCustomsProcedure": 4000,
            "nationalCustomsProcedure": 0,
            "quotaCode": "NEW",
            "valuationMethodCode": "",
            "rateOfAdjustment": 1,
            "statisticalValue": 408060.96,
            "itemValueLocal": 408060.96,
            "currency": "TTD",
            "exchangeRate": 1.0
        }
    ],
    "containers": []
}

url = "http://localhost:8021/pack/generate"
print(f"Sending LB01/23 test payload to {url}")

try:
    response = requests.post(url, json=payload, timeout=30)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")

    try:
        result = response.json()
        print("\nResponse JSON:")
        print(json.dumps(result, indent=2))

        if result.get("status") == "blocked":
            print("\n=== Validation Errors ===")
            for error in result.get("preflight", {}).get("errors", []):
                print(f"Error: {error}")
            for warning in result.get("preflight", {}).get("warnings", []):
                print(f"Warning: {warning}")

    except json.JSONDecodeError:
        print(f"Response text: {response.text[:500]}")

except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
    sys.exit(1)
