# Stallion Blueprint v1

## Product Positioning
ACE/ASYCUDA output fidelity with modern guided UX.

## Core Modules
1. Worksheet Header + Item Entry
2. Lookup Catalogs (ports/countries/terms/package/CPC)
3. Validation + XML Export
4. Output Pack (Info/Assessment/SAD/Container/Receipt metadata)
5. Worksheet Renderer (LB01 parity)
6. Templates/Profiles
7. OCR intake + HS suggestions (next phase)

## Implemented foundation (this scaffold)
- FastAPI app with lookup/template endpoints
- Worksheet calculator endpoint
- Declaration validate + export XML endpoints
- Reuse of existing emitter + contract from ace-backend
