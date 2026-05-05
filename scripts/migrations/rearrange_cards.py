#!/usr/bin/env python3
import re
import sys

with open('src/pages/StallionWorkbench.tsx', 'r') as f:
    content = f.read()

# Find all cards
cards = []
current_card = None
lines = content.split('\n')
card_start = None
card_depth = 0
in_card = False

for i, line in enumerate(lines):
    if '<Card ' in line and not in_card:
        card_start = i
        in_card = True
        card_depth = 1
        # Extract card id if present
        card_id = None
        match = re.search(r'id="([^"]+)"', line)
        if match:
            card_id = match.group(1)
        cards.append({
            'start': i,
            'id': card_id,
            'lines': []
        })
    elif in_card:
        if '<Card ' in line:
            card_depth += 1
        if '</Card>' in line:
            card_depth -= 1
            if card_depth == 0:
                in_card = False
                cards[-1]['end'] = i

# Reconstruct with worksheet last
# Order should be: Header, Parties, Items, Containers, Worksheet
card_order = ['section-header', 'section-parties', 'section-items', 'section-containers', 'section-worksheet']

# Group cards by id
cards_by_id = {}
for card in cards:
    if card['id']:
        cards_by_id[card['id']] = card

# Check all required cards present
missing = [cid for cid in card_order if cid not in cards_by_id]
if missing:
    print(f"Missing cards: {missing}")
    sys.exit(1)

# Build new content
new_lines = []
last_pos = 0

for cid in card_order:
    card = cards_by_id[cid]
    # Add content before this card
    for i in range(last_pos, card['start']):
        new_lines.append(lines[i])
    # Add the card itself
    for i in range(card['start'], card['end'] + 1):
        new_lines.append(lines[i])
    last_pos = card['end'] + 1

# Add remaining content after last card
for i in range(last_pos, len(lines)):
    new_lines.append(lines[i])

new_content = '\n'.join(new_lines)

# Write back
with open('src/pages/StallionWorkbench.tsx', 'w') as f:
    f.write(new_content)

print("Rearranged cards. New order:")
for cid in card_order:
    print(f"  - {cid}")