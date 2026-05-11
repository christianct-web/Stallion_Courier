# Stallion Courier — Polish Patch

Two targeted fixes for the issues called out in the handover.

## 1. Critical bug fix — route param mismatch

**File:** `frontend/src/App.tsx`

Changed routes from `:id` to `:manifestId` to match what the pages destructure:

```diff
- <Route path="/stallion/courier/:id" element={<CourierWorkbench />} />
- <Route path="/stallion/courier/:id/exam" element={<CourierExam />} />
+ <Route path="/stallion/courier/:manifestId" element={<CourierWorkbench />} />
+ <Route path="/stallion/courier/:manifestId/exam" element={<CourierExam />} />
```

Before this fix, clicking any manifest in the list silently bounced back because the page saw `manifestId === undefined`. After the fix, navigation works.

## 2. Matcher keyword priority fixes

**File:** `backend/app/services/courier_matcher.py`

Three concrete improvements:

### a. Phone case vs smartphone

Phone-case patterns now come **before** the smartphone pattern and have higher confidence (0.96 vs 0.95). Added more aliases:

```python
(r"\b(phone\s*case|phone\s*cover|phone\s*holder|cellphone\s*case|cell\s*phone\s*case|smart\s*phone\s*case|smartphone\s*case|iphone\s*case)\b",
    "39269090", 0.0, 0.96, "Cellphone case — full exempt as plastic accessory"),
```

### b. Wooden furniture vs coffee

Added a wooden-furniture section with priority over the existing coffee pattern:

```python
# ── Furniture ────────────────────────────────────────────────────────
(r"\b(wooden\s*(?:coffee\s*)?table|wooden\s*chair|wooden\s*shelf|...)\b",
    "94036000", 0.20, 0.90, "Wooden furniture — 94036000"),
(r"\b(coffee\s*table|dining\s*table|side\s*table|...)\b",
    "94036000", 0.20, 0.82, "Table — wooden furniture (most common)"),
```

Also tightened the coffee pattern so it only matches food-context terms (bean, ground, instant, etc.) more aggressively.

### c. Women's blouse vs t-shirt

Added a women's-blouse pattern before the generic shirt/blouse pattern:

```python
(r"\b(women.?s?\s*blouse|ladies.?\s*blouse|womens\s*shirt|ladies\s*shirt)\b",
    "62064000", 0.20, 0.88, "Women's blouse — 62064000"),
```

### d. Suppression rules (new mechanism)

Added a context-aware suppression system so a candidate is removed when the description contains a suppressor pattern:

```python
SUPPRESSION_RULES = [
    # (thn_to_suppress, suppressor_pattern, reason)
    ("85171300", r"\b(case|cover|holder|protector|skin|sleeve|...)\b", ...),
    ("09011100", r"\b(table|chair|furniture|wooden|wood|cup|...)\b", ...),
    ("09022000", r"\b(table|cup|mug|pot|kettle|maker|set|...)\b", ...),
    ("61091000", r"\b(women.?s?\s*blouse|ladies.?\s*blouse|...)\b", ...),
]
```

This pattern is **extensible** — adding new contextual disambiguations is now a one-line append.

## Verification

### Backend tests
```
$ cd backend && python -m pytest tests/test_courier.py
============================== 51 passed in 5.32s ==============================
```

### End-to-end matcher test (21/21 correct, up from 12/13)
```
✓ 'iPhone 15 Pro Max'           -> 85171300 (full_exempt)   Smartphones
✓ 'smartphone case plastic'     -> 39269090 (full_exempt)   Plastic article  [was broken]
✓ 'phone case'                  -> 39269090 (full_exempt)   Plastic article
✓ 'wooden coffee table'         -> 94036000 (none)          Wooden furniture  [was broken]
✓ 'wooden shelf'                -> 94036000 (none)          Wooden furniture
✓ 'coffee beans'                -> 09011100 (none)          Coffee
✓ 'women's blouse'              -> 62064000 (none)          Women's blouse    [was broken]
✓ 'ladies blouse'               -> 62064000 (none)          Women's blouse
✓ 'cotton t-shirt'              -> 61091000 (none)          T-shirts
... (all 21 passing)
```

### Frontend type-check + build
```
$ npx tsc --noEmit
(no errors)

$ npm run build
✓ built in 10.15s
CourierManifests-q8NOVyRz.js     11.33 kB │ gzip:   3.38 kB
CourierExam-oeKNDFCM.js          14.02 kB │ gzip:   3.79 kB
CourierWorkbench-Bc7keYeA.js     18.44 kB │ gzip:   4.87 kB
```

## How to apply

```bash
cd /path/to/Stallion_Courier
cp courier_matcher.py backend/app/services/courier_matcher.py
cp App.tsx frontend/src/App.tsx

# Verify
cd backend && python -m pytest tests/test_courier.py
cd ../frontend && npx tsc --noEmit && npm run build
```

## What this leaves open

From the original handover, the remaining items are:

1. **Empty manifest store.** The Phase 7 importer is intact and works (verified by smoke-test: create → export → recalc → 0 formula errors). It just needs to be run against your eleven historical AWBs. The importer expects a directory of completed v3 worksheets and creates manifests from them. Run on AWB 5034 first to validate before processing the others.

2. **Arnim sign-off on bundled rules.** Still operational, not technical. Add an entry to the audit log when sign-off happens.

3. **De-minimis rule.** Open product question for Arnim.

4. **Phase 4 TTPOST blank-template parser.** Not built. Spec is documented in `Phase 3 README` from earlier sessions.

5. **SQLite migration.** Not urgent until manifest count crosses ~100.

The polish patch unblocks the critical bug (clicking a manifest now works) and tightens the classifier on the three known-broken cases. With the v3 tariff (5,810 entries) already deployed, this is the matcher running on solid data.
