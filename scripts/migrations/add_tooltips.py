#!/usr/bin/env python3
import re
import sys

file_path = 'src/pages/StallionWorkbench.tsx'

# Field descriptions for key fields
field_descriptions = {
    # Header section
    "Declaration Ref": "Customs declaration reference number (e.g., LB01/23)",
    "Port of Entry": "Port where goods will be cleared through customs",
    "Terms of Delivery": "Incoterms governing delivery (CIF, FOB, etc.)",
    "Mode of Transport": "How goods arrive (Sea, Air, Road)",
    "Customs Regime": "Type of customs procedure (Import, Transit, etc.)",
    "Consignee Code": "Importer's customs registration code",
    "Supplier Name": "Exporter/supplier company name",
    "Supplier Address": "Supplier's full address (street, city, country)",
    "Vessel / Flight": "Name of vessel or flight number",
    "Invoice Number": "Commercial invoice number",
    "Invoice Date": "Date of commercial invoice",
    
    # Parties section
    "Consignee Name": "Name of the importer/consignee",
    "Consignee Address": "Importer's address for customs purposes",
    "Declarant TIN": "Declarant's Taxpayer Identification Number",
    "Declarant Name": "Name of the customs declarant",
    "B/L AWB Number": "Bill of Lading or Air Waybill number",
    "B/L AWB Date": "Date of transport document",
    "ETA Date": "Estimated Time of Arrival at port",
    "Currency": "Currency of invoice (USD, EUR, etc.)",
    "Bank Code": "Bank code for payment processing",
    "Mode of Payment": "Method of payment (CASH, CREDIT, etc.)",
    "Terms Code": "Payment terms code",
    "Terms Description": "Description of payment terms",
    "Country First Destination": "First country of destination after export",
    "Trading Country": "Country of trading partner",
    "Export Country Code": "Country code of exporter",
    "Export Country Name": "Name of export country",
    "Country of Origin Name": "Country where goods were produced",
    
    # Worksheet section
    "Invoice (foreign)": "Total invoice value in foreign currency",
    "Exchange rate": "Exchange rate to local currency",
    "Freight": "International freight cost in foreign currency",
    "Insurance": "Insurance cost in foreign currency",
    "Other": "Other costs (packing, handling) in foreign currency",
    "Deduction": "Any deductions from CIF value",
    "Duty %": "Import duty percentage rate",
    "Surcharge %": "Import surcharge percentage rate",
    "VAT %": "Value Added Tax percentage rate",
    "Extra fees (local)": "Additional local fees (Box 23, etc.)",
    "Global fee (UFC)": "Fixed customs user fee",
    
    # Item editor
    "HS Code": "Harmonized System tariff classification code",
    "CPC": "Customs Procedure Code",
    "Duty/Tax": "Duty or tax code applied to item",
    "Duty/Tax Base": "Base for duty calculation (value, weight, etc.)",
    "Unit Code": "Unit of measurement code",
    "Qty": "Quantity of goods",
    "Package": "Type of packaging",
    "Gross Kg": "Gross weight in kilograms",
    "Net Kg": "Net weight in kilograms",
    "Item Value": "Value of this line item",
}

with open(file_path, 'r') as f:
    content = f.read()

# Function to wrap a label with tooltip
def wrap_label(match):
    full_match = match.group(0)
    label_text = match.group(1)
    
    # Check if already has tooltip
    if '<Tooltip>' in full_match:
        return full_match
    
    description = field_descriptions.get(label_text.strip())
    if not description:
        return full_match
    
    return f'''<Tooltip>
          <TooltipTrigger asChild>
            {full_match}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{description}</p>
          </TooltipContent>
        </Tooltip>'''

# Pattern to find <Label>...</Label> tags
# This is a simplified pattern - real implementation needs to handle multiline
pattern = r'<Label>([^<]+)</Label>'

# Simple replacement for now - we'll do a more sophisticated approach
lines = content.split('\n')
new_lines = []

for line in lines:
    # Look for Label patterns
    if '<Label>' in line and '</Label>' in line:
        # Extract label text
        match = re.search(r'<Label>([^<]+)</Label>', line)
        if match:
            label_text = match.group(1).strip()
            description = field_descriptions.get(label_text)
            if description:
                # Replace with tooltip
                new_line = line.replace(
                    match.group(0),
                    f'''<Tooltip>
          <TooltipTrigger asChild>
            <Label>{label_text}</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{description}</p>
          </TooltipContent>
        </Tooltip>'''
                )
                new_lines.append(new_line)
                continue
    new_lines.append(line)

new_content = '\n'.join(new_lines)

# Write back
with open(file_path, 'w') as f:
    f.write(new_content)

print("Added tooltips to fields with descriptions")