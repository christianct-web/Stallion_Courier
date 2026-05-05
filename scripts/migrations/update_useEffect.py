#!/usr/bin/env python3
import re

with open('src/pages/StallionWorkbench.tsx', 'r') as f:
    lines = f.readlines()

# Find the line index of "// Auto-populate Supplier Country if not set"
start_idx = -1
for i, line in enumerate(lines):
    if line.strip() == "// Auto-populate Supplier Country if not set":
        start_idx = i
        break

if start_idx == -1:
    print("Supplier country comment not found")
    exit(1)

# Find the line index of "  const applyTemplate = () => {"
end_idx = -1
for i in range(start_idx, len(lines)):
    if lines[i].strip().startswith("const applyTemplate ="):
        end_idx = i - 1  # line before applyTemplate
        break

if end_idx == -1:
    print("applyTemplate not found")
    exit(1)

print(f"Replacing lines {start_idx+1} to {end_idx+1}")

new_effect = '''  // Auto-populate Supplier Country if not set
  useEffect(() => {
    if (!form.consignorCountry && form.consignorName) {
      // Default country based on common patterns
      const lowerName = form.consignorName.toLowerCase();
      let country = "";
      if (lowerName.includes("china") || lowerName.includes("shanghai")) country = "China";
      else if (lowerName.includes("usa") || lowerName.includes("united states")) country = "United States";
      else if (lowerName.includes("uk") || lowerName.includes("united kingdom")) country = "United Kingdom";
      else if (lowerName.includes("trinidad") || lowerName.includes("tobago")) country = "Trinidad and Tobago";
      
      if (country) {
        setForm(f => ({ ...f, consignorCountry: country }));
      }
    }
  }, [form.consignorName, form.consignorCountry]);

  // Auto-populate duty, VAT, and surcharge rates based on item duty tax codes
  useEffect(() => {
    const dutyCodes = items.map(item => item.dutyTaxCode).filter(Boolean);
    const hasDuty = dutyCodes.includes('01');
    const hasSurcharge = dutyCodes.includes('05');
    const hasVAT = dutyCodes.includes('20');
    
    setForm(f => ({
      ...f,
      duty_rate_pct: hasDuty ? 40 : f.duty_rate_pct,
      surcharge_rate_pct: hasSurcharge ? 15 : f.surcharge_rate_pct,
      vat_rate_pct: hasVAT ? 12.5 : f.vat_rate_pct
    }));
  }, [items]);

'''

# Replace the block
lines[start_idx:end_idx+1] = [new_effect]

with open('src/pages/StallionWorkbench.tsx', 'w') as f:
    f.writelines(lines)

print("Updated with new useEffect for tax rates")