#!/usr/bin/env python3
with open('src/pages/StallionWorkbench.tsx', 'r') as f:
    lines = f.readlines()

# Find start and end of first two useEffects
# Start line index of "// Auto-populate Supplier Street/City/Country..."
start = None
for i, line in enumerate(lines):
    if line.strip() == "// Auto-populate Supplier Street/City/Country from Supplier Address":
        start = i
        break

if start is None:
    print("Start not found")
    exit(1)

# Find line index of "  // Auto-populate duty, VAT, and surcharge rates..."
end = None
for i in range(start, len(lines)):
    if line.strip() == "// Auto-populate duty, VAT, and surcharge rates based on item duty tax codes":
        end = i - 1  # line before the comment
        break

if end is None:
    print("End not found")
    exit(1)

print(f"Deleting lines {start+1} to {end+1}")
del lines[start:end]

with open('src/pages/StallionWorkbench.tsx', 'w') as f:
    f.writelines(lines)

print("Removed supplier auto-population useEffects")