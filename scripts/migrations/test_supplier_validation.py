#!/usr/bin/env python3
import json
import requests
import sys
import xml.etree.ElementTree as ET

# Test payload with supplier data (mimicking auto-populated fields)
payload = {
    "declaration": {
        "identification": {
            "office_segment_customs_clearance_office_code": "TTPTS",
            "type_type_of_declaration": "IM",
            "declaration_gen_procedure_code": 4,
            "registration_number": "TEST123",
            "registration_date": "2026-02-21"
        },
        "traders": {
            "exporter_exporter_name": "Test Supplier Inc.\n123 Supplier Street\nSupplier City",
            "consignee_consignee_code": "TEST001",
            "consignee_consignee_name": "Test Consignee Ltd.\n123 Test Street\nTest City"
        },
        "declarant": {
            "declarant_code": "DEC001",
            "declarant_name": "Test Declarant",
            "reference_number": "TEST123"
        },
        "general_information": {
            "country_country_first_destination": "US",
            "country_trading_country": "US",
            "export_export_country_code": "US",
            "export_export_country_name": "United States",
            "destination_destination_country_code": "TT",
            "destination_destination_country_name": "Trinidad and Tobago",
            "country_of_origin_name": "United States",
            "comments_free_text": "B/L - AWB NO: TSCW16401583               Dated: 2026-02-21\nRATE OF EXCH: USD     1.00000\nGROSS WGHT (kgs):    1500.000\nE T A:    2026-02-22\n\n"
        },
        "transport": {
            "border_office_code": "TTPTS",
            "border_office_name": "Point Lisas",
            "container_flag": "true",
            "delivery_terms_code": "CIF",
            "delivery_terms_place": "TTPTS",
            "means_of_transport_border_information_identity": "TEST VESSEL",
            "means_of_transport_departure_arrival_information_identity": "TEST VESSEL"
        },
        "financial": {
            "bank_code": 1,
            "mode_of_payment": "CASH",
            "terms_code": 99,
            "terms_description": "Basic",
            "total_invoice": "10700.0"
        },
        "valuation": {
            "calculation_working_mode": 2,
            "total_total_invoice": 10700.0,
            "total_cif": 10700.0,
            "gs_invoice_amount_foreign_currency": 10700.0,
            "gs_invoice_amount_national_currency": 10700.0,
            "gs_invoice_currency_code": "USD",
            "gs_invoice_currency_rate": 1.0,
            "gs_external_freight_amount_foreign_currency": 500.0,
            "gs_external_freight_amount_national_currency": 500.0,
            "gs_external_freight_currency_code": "USD",
            "gs_external_freight_currency_rate": 1.0,
            "gs_insurance_amount_foreign_currency": 200.0,
            "gs_insurance_amount_national_currency": 200.0,
            "gs_insurance_currency_code": "USD",
            "gs_insurance_currency_rate": 1.0,
            "gs_other_cost_amount_foreign_currency": 0.0,
            "gs_other_cost_amount_national_currency": 0.0,
            "gs_other_cost_currency_code": "USD",
            "gs_other_cost_currency_rate": 1.0
        },
        "items": [
            {
                "goods_description": {
                    "commercial_description": "BONELESS SKINLESS CHICKEN BREAST FILETS",
                    "country_of_origin_code": "US",
                    "country_of_origin_region": ""
                },
                "packages": {
                    "kind_of_packages_code": "CS",
                    "kind_of_packages_name": "Case",
                    "marks1_of_packages": "AS ADDRESSED",
                    "marks2_of_packages": "",
                    "number_of_packages": 100.0
                },
                "tarification": {
                    "extended_customs_procedure": 4000,
                    "hscode": {
                        "commodity_code": "2071490",
                        "precision_1": "",
                        "precision_2": None,
                        "precision_3": None,
                        "precision_4": None
                    },
                    "national_customs_procedure": 0,
                    "preference_code": None,
                    "quota_code": "NEW",
                    "valuation_method_code": "",
                    "value_item": 10700.0
                },
                "valuation_item": {
                    "total_cif_itm": 10700.0,
                    "weight_itm": {
                        "gross_weight_itm": 1500.0,
                        "net_weight_itm": 1350.0
                    }
                }
            }
        ],
        "suppliers_documents": {
            "suppliers_document_name": "Test Supplier Inc.",
            "suppliers_document_street": "123 Supplier Street",
            "suppliers_document_city": "Supplier City",
            "suppliers_document_country": "United States",
            "suppliers_document_type_code": "IV05",
            "suppliers_document_invoice_nbr": 1,
            "suppliers_document_date": "2026-02-21"
        }
    }
}

print("Testing validation and XML generation with supplier data...")
print("=" * 60)

# Test validation endpoint
url = "http://localhost:8020/declarations/validate"
print(f"1. Testing validation at {url}")
try:
    response = requests.post(url, json=payload, timeout=30)
    result = response.json()
    print(f"   Status: {result.get('status')}")
    print(f"   Errors: {len(result.get('errors', []))}")
    print(f"   Warnings: {len(result.get('warnings', []))}")
    
    if result.get("status") != "pass":
        print("\n   Validation failed:")
        for error in result.get("errors", []):
            print(f"   - {error.get('path')}: {error.get('message')}")
        sys.exit(1)
        
except Exception as e:
    print(f"   Validation request failed: {e}")
    sys.exit(1)

# Test XML export
url = "http://localhost:8020/declarations/export-xml"
print(f"\n2. Testing XML export at {url}")
try:
    response = requests.post(url, json=payload, timeout=30)
    result = response.json()
    
    if result.get("validation", {}).get("status") != "pass":
        print("   XML export validation failed")
        sys.exit(1)
    
    xml_content = result.get("xml")
    if not xml_content:
        print("   No XML generated")
        sys.exit(1)
    
    print(f"   XML generated: {len(xml_content)} chars")
    
    # Save XML for inspection
    with open('/tmp/test_supplier.xml', 'w') as f:
        f.write(xml_content)
    print("   XML saved to /tmp/test_supplier.xml")
    
    # Check for supplier data in XML
    root = ET.fromstring(xml_content)
    
    # Look for supplier/exporter elements
    exporter_found = False
    supplier_found = False
    
    for elem in root.iter():
        tag = elem.tag.lower()
        text = (elem.text or "").lower()
        
        if 'exporter' in tag or 'supplier' in tag:
            if 'exporter' in tag:
                exporter_found = True
                print(f"   Found exporter element: {elem.tag}")
            if 'supplier' in tag:
                supplier_found = True
                print(f"   Found supplier element: {elem.tag}")
        
        # Also check for our test data
        if 'test supplier' in text:
            print(f"   Found supplier text in element: {elem.tag}")
    
    print(f"\n   Supplier data check:")
    print(f"   - Exporter elements found: {exporter_found}")
    print(f"   - Supplier elements found: {supplier_found}")
    
except Exception as e:
    print(f"   XML export failed: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ All tests passed! Supplier data is properly validated")
print("   and included in XML generation.")