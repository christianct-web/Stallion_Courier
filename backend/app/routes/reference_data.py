"""
reference_data.py — dropdown reference sets for the Stallion Sheet UI.

Served at GET /sheets/reference. Each list is [{code,label}]. Countries are
full ISO-3166 alpha-2 with TT and major trade partners pinned to the top.

Drop into backend/app/routes/reference_data.py
"""

REFERENCE = {
  "countries": [
    {
      "code": "TT",
      "label": "Trinidad and Tobago"
    },
    {
      "code": "US",
      "label": "United States"
    },
    {
      "code": "CN",
      "label": "China"
    },
    {
      "code": "GB",
      "label": "United Kingdom"
    },
    {
      "code": "CA",
      "label": "Canada"
    },
    {
      "code": "JP",
      "label": "Japan"
    },
    {
      "code": "DE",
      "label": "Germany"
    },
    {
      "code": "BR",
      "label": "Brazil"
    },
    {
      "code": "IN",
      "label": "India"
    },
    {
      "code": "AF",
      "label": "Afghanistan"
    },
    {
      "code": "AL",
      "label": "Albania"
    },
    {
      "code": "DZ",
      "label": "Algeria"
    },
    {
      "code": "AS",
      "label": "American Samoa"
    },
    {
      "code": "AD",
      "label": "Andorra"
    },
    {
      "code": "AO",
      "label": "Angola"
    },
    {
      "code": "AI",
      "label": "Anguilla"
    },
    {
      "code": "AQ",
      "label": "Antarctica"
    },
    {
      "code": "AG",
      "label": "Antigua and Barbuda"
    },
    {
      "code": "AR",
      "label": "Argentina"
    },
    {
      "code": "AM",
      "label": "Armenia"
    },
    {
      "code": "AW",
      "label": "Aruba"
    },
    {
      "code": "AU",
      "label": "Australia"
    },
    {
      "code": "AT",
      "label": "Austria"
    },
    {
      "code": "AZ",
      "label": "Azerbaijan"
    },
    {
      "code": "BS",
      "label": "Bahamas"
    },
    {
      "code": "BH",
      "label": "Bahrain"
    },
    {
      "code": "BD",
      "label": "Bangladesh"
    },
    {
      "code": "BB",
      "label": "Barbados"
    },
    {
      "code": "BY",
      "label": "Belarus"
    },
    {
      "code": "BE",
      "label": "Belgium"
    },
    {
      "code": "BZ",
      "label": "Belize"
    },
    {
      "code": "BJ",
      "label": "Benin"
    },
    {
      "code": "BM",
      "label": "Bermuda"
    },
    {
      "code": "BT",
      "label": "Bhutan"
    },
    {
      "code": "BO",
      "label": "Bolivia, Plurinational State of"
    },
    {
      "code": "BQ",
      "label": "Bonaire, Sint Eustatius and Saba"
    },
    {
      "code": "BA",
      "label": "Bosnia and Herzegovina"
    },
    {
      "code": "BW",
      "label": "Botswana"
    },
    {
      "code": "BV",
      "label": "Bouvet Island"
    },
    {
      "code": "IO",
      "label": "British Indian Ocean Territory"
    },
    {
      "code": "BN",
      "label": "Brunei Darussalam"
    },
    {
      "code": "BG",
      "label": "Bulgaria"
    },
    {
      "code": "BF",
      "label": "Burkina Faso"
    },
    {
      "code": "BI",
      "label": "Burundi"
    },
    {
      "code": "CV",
      "label": "Cabo Verde"
    },
    {
      "code": "KH",
      "label": "Cambodia"
    },
    {
      "code": "CM",
      "label": "Cameroon"
    },
    {
      "code": "KY",
      "label": "Cayman Islands"
    },
    {
      "code": "CF",
      "label": "Central African Republic"
    },
    {
      "code": "TD",
      "label": "Chad"
    },
    {
      "code": "CL",
      "label": "Chile"
    },
    {
      "code": "CX",
      "label": "Christmas Island"
    },
    {
      "code": "CC",
      "label": "Cocos (Keeling) Islands"
    },
    {
      "code": "CO",
      "label": "Colombia"
    },
    {
      "code": "KM",
      "label": "Comoros"
    },
    {
      "code": "CG",
      "label": "Congo"
    },
    {
      "code": "CD",
      "label": "Congo, The Democratic Republic of the"
    },
    {
      "code": "CK",
      "label": "Cook Islands"
    },
    {
      "code": "CR",
      "label": "Costa Rica"
    },
    {
      "code": "HR",
      "label": "Croatia"
    },
    {
      "code": "CU",
      "label": "Cuba"
    },
    {
      "code": "CW",
      "label": "Curaçao"
    },
    {
      "code": "CY",
      "label": "Cyprus"
    },
    {
      "code": "CZ",
      "label": "Czechia"
    },
    {
      "code": "CI",
      "label": "Côte d'Ivoire"
    },
    {
      "code": "DK",
      "label": "Denmark"
    },
    {
      "code": "DJ",
      "label": "Djibouti"
    },
    {
      "code": "DM",
      "label": "Dominica"
    },
    {
      "code": "DO",
      "label": "Dominican Republic"
    },
    {
      "code": "EC",
      "label": "Ecuador"
    },
    {
      "code": "EG",
      "label": "Egypt"
    },
    {
      "code": "SV",
      "label": "El Salvador"
    },
    {
      "code": "GQ",
      "label": "Equatorial Guinea"
    },
    {
      "code": "ER",
      "label": "Eritrea"
    },
    {
      "code": "EE",
      "label": "Estonia"
    },
    {
      "code": "SZ",
      "label": "Eswatini"
    },
    {
      "code": "ET",
      "label": "Ethiopia"
    },
    {
      "code": "FK",
      "label": "Falkland Islands (Malvinas)"
    },
    {
      "code": "FO",
      "label": "Faroe Islands"
    },
    {
      "code": "FJ",
      "label": "Fiji"
    },
    {
      "code": "FI",
      "label": "Finland"
    },
    {
      "code": "FR",
      "label": "France"
    },
    {
      "code": "GF",
      "label": "French Guiana"
    },
    {
      "code": "PF",
      "label": "French Polynesia"
    },
    {
      "code": "TF",
      "label": "French Southern Territories"
    },
    {
      "code": "GA",
      "label": "Gabon"
    },
    {
      "code": "GM",
      "label": "Gambia"
    },
    {
      "code": "GE",
      "label": "Georgia"
    },
    {
      "code": "GH",
      "label": "Ghana"
    },
    {
      "code": "GI",
      "label": "Gibraltar"
    },
    {
      "code": "GR",
      "label": "Greece"
    },
    {
      "code": "GL",
      "label": "Greenland"
    },
    {
      "code": "GD",
      "label": "Grenada"
    },
    {
      "code": "GP",
      "label": "Guadeloupe"
    },
    {
      "code": "GU",
      "label": "Guam"
    },
    {
      "code": "GT",
      "label": "Guatemala"
    },
    {
      "code": "GG",
      "label": "Guernsey"
    },
    {
      "code": "GN",
      "label": "Guinea"
    },
    {
      "code": "GW",
      "label": "Guinea-Bissau"
    },
    {
      "code": "GY",
      "label": "Guyana"
    },
    {
      "code": "HT",
      "label": "Haiti"
    },
    {
      "code": "HM",
      "label": "Heard Island and McDonald Islands"
    },
    {
      "code": "VA",
      "label": "Holy See (Vatican City State)"
    },
    {
      "code": "HN",
      "label": "Honduras"
    },
    {
      "code": "HK",
      "label": "Hong Kong"
    },
    {
      "code": "HU",
      "label": "Hungary"
    },
    {
      "code": "IS",
      "label": "Iceland"
    },
    {
      "code": "ID",
      "label": "Indonesia"
    },
    {
      "code": "IR",
      "label": "Iran, Islamic Republic of"
    },
    {
      "code": "IQ",
      "label": "Iraq"
    },
    {
      "code": "IE",
      "label": "Ireland"
    },
    {
      "code": "IM",
      "label": "Isle of Man"
    },
    {
      "code": "IL",
      "label": "Israel"
    },
    {
      "code": "IT",
      "label": "Italy"
    },
    {
      "code": "JM",
      "label": "Jamaica"
    },
    {
      "code": "JE",
      "label": "Jersey"
    },
    {
      "code": "JO",
      "label": "Jordan"
    },
    {
      "code": "KZ",
      "label": "Kazakhstan"
    },
    {
      "code": "KE",
      "label": "Kenya"
    },
    {
      "code": "KI",
      "label": "Kiribati"
    },
    {
      "code": "KP",
      "label": "Korea, Democratic People's Republic of"
    },
    {
      "code": "KR",
      "label": "Korea, Republic of"
    },
    {
      "code": "KW",
      "label": "Kuwait"
    },
    {
      "code": "KG",
      "label": "Kyrgyzstan"
    },
    {
      "code": "LA",
      "label": "Lao People's Democratic Republic"
    },
    {
      "code": "LV",
      "label": "Latvia"
    },
    {
      "code": "LB",
      "label": "Lebanon"
    },
    {
      "code": "LS",
      "label": "Lesotho"
    },
    {
      "code": "LR",
      "label": "Liberia"
    },
    {
      "code": "LY",
      "label": "Libya"
    },
    {
      "code": "LI",
      "label": "Liechtenstein"
    },
    {
      "code": "LT",
      "label": "Lithuania"
    },
    {
      "code": "LU",
      "label": "Luxembourg"
    },
    {
      "code": "MO",
      "label": "Macao"
    },
    {
      "code": "MG",
      "label": "Madagascar"
    },
    {
      "code": "MW",
      "label": "Malawi"
    },
    {
      "code": "MY",
      "label": "Malaysia"
    },
    {
      "code": "MV",
      "label": "Maldives"
    },
    {
      "code": "ML",
      "label": "Mali"
    },
    {
      "code": "MT",
      "label": "Malta"
    },
    {
      "code": "MH",
      "label": "Marshall Islands"
    },
    {
      "code": "MQ",
      "label": "Martinique"
    },
    {
      "code": "MR",
      "label": "Mauritania"
    },
    {
      "code": "MU",
      "label": "Mauritius"
    },
    {
      "code": "YT",
      "label": "Mayotte"
    },
    {
      "code": "MX",
      "label": "Mexico"
    },
    {
      "code": "FM",
      "label": "Micronesia, Federated States of"
    },
    {
      "code": "MD",
      "label": "Moldova, Republic of"
    },
    {
      "code": "MC",
      "label": "Monaco"
    },
    {
      "code": "MN",
      "label": "Mongolia"
    },
    {
      "code": "ME",
      "label": "Montenegro"
    },
    {
      "code": "MS",
      "label": "Montserrat"
    },
    {
      "code": "MA",
      "label": "Morocco"
    },
    {
      "code": "MZ",
      "label": "Mozambique"
    },
    {
      "code": "MM",
      "label": "Myanmar"
    },
    {
      "code": "NA",
      "label": "Namibia"
    },
    {
      "code": "NR",
      "label": "Nauru"
    },
    {
      "code": "NP",
      "label": "Nepal"
    },
    {
      "code": "NL",
      "label": "Netherlands"
    },
    {
      "code": "NC",
      "label": "New Caledonia"
    },
    {
      "code": "NZ",
      "label": "New Zealand"
    },
    {
      "code": "NI",
      "label": "Nicaragua"
    },
    {
      "code": "NE",
      "label": "Niger"
    },
    {
      "code": "NG",
      "label": "Nigeria"
    },
    {
      "code": "NU",
      "label": "Niue"
    },
    {
      "code": "NF",
      "label": "Norfolk Island"
    },
    {
      "code": "MK",
      "label": "North Macedonia"
    },
    {
      "code": "MP",
      "label": "Northern Mariana Islands"
    },
    {
      "code": "NO",
      "label": "Norway"
    },
    {
      "code": "OM",
      "label": "Oman"
    },
    {
      "code": "PK",
      "label": "Pakistan"
    },
    {
      "code": "PW",
      "label": "Palau"
    },
    {
      "code": "PS",
      "label": "Palestine, State of"
    },
    {
      "code": "PA",
      "label": "Panama"
    },
    {
      "code": "PG",
      "label": "Papua New Guinea"
    },
    {
      "code": "PY",
      "label": "Paraguay"
    },
    {
      "code": "PE",
      "label": "Peru"
    },
    {
      "code": "PH",
      "label": "Philippines"
    },
    {
      "code": "PN",
      "label": "Pitcairn"
    },
    {
      "code": "PL",
      "label": "Poland"
    },
    {
      "code": "PT",
      "label": "Portugal"
    },
    {
      "code": "PR",
      "label": "Puerto Rico"
    },
    {
      "code": "QA",
      "label": "Qatar"
    },
    {
      "code": "RO",
      "label": "Romania"
    },
    {
      "code": "RU",
      "label": "Russian Federation"
    },
    {
      "code": "RW",
      "label": "Rwanda"
    },
    {
      "code": "RE",
      "label": "Réunion"
    },
    {
      "code": "BL",
      "label": "Saint Barthélemy"
    },
    {
      "code": "SH",
      "label": "Saint Helena, Ascension and Tristan da Cunha"
    },
    {
      "code": "KN",
      "label": "Saint Kitts and Nevis"
    },
    {
      "code": "LC",
      "label": "Saint Lucia"
    },
    {
      "code": "MF",
      "label": "Saint Martin (French part)"
    },
    {
      "code": "PM",
      "label": "Saint Pierre and Miquelon"
    },
    {
      "code": "VC",
      "label": "Saint Vincent and the Grenadines"
    },
    {
      "code": "WS",
      "label": "Samoa"
    },
    {
      "code": "SM",
      "label": "San Marino"
    },
    {
      "code": "ST",
      "label": "Sao Tome and Principe"
    },
    {
      "code": "SA",
      "label": "Saudi Arabia"
    },
    {
      "code": "SN",
      "label": "Senegal"
    },
    {
      "code": "RS",
      "label": "Serbia"
    },
    {
      "code": "SC",
      "label": "Seychelles"
    },
    {
      "code": "SL",
      "label": "Sierra Leone"
    },
    {
      "code": "SG",
      "label": "Singapore"
    },
    {
      "code": "SX",
      "label": "Sint Maarten (Dutch part)"
    },
    {
      "code": "SK",
      "label": "Slovakia"
    },
    {
      "code": "SI",
      "label": "Slovenia"
    },
    {
      "code": "SB",
      "label": "Solomon Islands"
    },
    {
      "code": "SO",
      "label": "Somalia"
    },
    {
      "code": "ZA",
      "label": "South Africa"
    },
    {
      "code": "GS",
      "label": "South Georgia and the South Sandwich Islands"
    },
    {
      "code": "SS",
      "label": "South Sudan"
    },
    {
      "code": "ES",
      "label": "Spain"
    },
    {
      "code": "LK",
      "label": "Sri Lanka"
    },
    {
      "code": "SD",
      "label": "Sudan"
    },
    {
      "code": "SR",
      "label": "Suriname"
    },
    {
      "code": "SJ",
      "label": "Svalbard and Jan Mayen"
    },
    {
      "code": "SE",
      "label": "Sweden"
    },
    {
      "code": "CH",
      "label": "Switzerland"
    },
    {
      "code": "SY",
      "label": "Syrian Arab Republic"
    },
    {
      "code": "TW",
      "label": "Taiwan, Province of China"
    },
    {
      "code": "TJ",
      "label": "Tajikistan"
    },
    {
      "code": "TZ",
      "label": "Tanzania, United Republic of"
    },
    {
      "code": "TH",
      "label": "Thailand"
    },
    {
      "code": "TL",
      "label": "Timor-Leste"
    },
    {
      "code": "TG",
      "label": "Togo"
    },
    {
      "code": "TK",
      "label": "Tokelau"
    },
    {
      "code": "TO",
      "label": "Tonga"
    },
    {
      "code": "TN",
      "label": "Tunisia"
    },
    {
      "code": "TM",
      "label": "Turkmenistan"
    },
    {
      "code": "TC",
      "label": "Turks and Caicos Islands"
    },
    {
      "code": "TV",
      "label": "Tuvalu"
    },
    {
      "code": "TR",
      "label": "Türkiye"
    },
    {
      "code": "UG",
      "label": "Uganda"
    },
    {
      "code": "UA",
      "label": "Ukraine"
    },
    {
      "code": "AE",
      "label": "United Arab Emirates"
    },
    {
      "code": "UM",
      "label": "United States Minor Outlying Islands"
    },
    {
      "code": "UY",
      "label": "Uruguay"
    },
    {
      "code": "UZ",
      "label": "Uzbekistan"
    },
    {
      "code": "VU",
      "label": "Vanuatu"
    },
    {
      "code": "VE",
      "label": "Venezuela, Bolivarian Republic of"
    },
    {
      "code": "VN",
      "label": "Viet Nam"
    },
    {
      "code": "VG",
      "label": "Virgin Islands, British"
    },
    {
      "code": "VI",
      "label": "Virgin Islands, U.S."
    },
    {
      "code": "WF",
      "label": "Wallis and Futuna"
    },
    {
      "code": "EH",
      "label": "Western Sahara"
    },
    {
      "code": "YE",
      "label": "Yemen"
    },
    {
      "code": "ZM",
      "label": "Zambia"
    },
    {
      "code": "ZW",
      "label": "Zimbabwe"
    },
    {
      "code": "AX",
      "label": "Åland Islands"
    }
  ],
  "cpc": [
    {
      "code": "4000",
      "label": "4000 — Home Use (direct entry, duty/VAT paid)"
    },
    {
      "code": "4070",
      "label": "4070 — Returning Resident / Personal Effects relief"
    },
    {
      "code": "4071",
      "label": "4071 — Diplomatic / Government concession"
    },
    {
      "code": "4100",
      "label": "4100 — Ex-warehouse for home use"
    },
    {
      "code": "7100",
      "label": "7100 — Entry for warehousing"
    },
    {
      "code": "4300",
      "label": "4300 — Temporary import"
    },
    {
      "code": "3071",
      "label": "3071 — Re-export from warehouse"
    },
    {
      "code": "1000",
      "label": "1000 — Permanent export"
    }
  ],
  "nature_of_transaction": [
    {
      "code": "1",
      "label": "1 — Outright purchase / sale"
    },
    {
      "code": "2",
      "label": "2 — Return of goods"
    },
    {
      "code": "3",
      "label": "3 — Goods on hire / lease"
    },
    {
      "code": "4",
      "label": "4 — Goods supplied free of charge"
    },
    {
      "code": "7",
      "label": "7 — Personal / household effects (no sale)"
    },
    {
      "code": "9",
      "label": "9 — Other"
    }
  ],
  "package_types": [
    {
      "code": "PK",
      "label": "PK — Package"
    },
    {
      "code": "CT",
      "label": "CT — Carton"
    },
    {
      "code": "BX",
      "label": "BX — Box"
    },
    {
      "code": "PLT",
      "label": "PLT — Pallet"
    },
    {
      "code": "CS",
      "label": "CS — Case"
    },
    {
      "code": "BG",
      "label": "BG — Bag"
    },
    {
      "code": "DR",
      "label": "DR — Drum"
    },
    {
      "code": "CN",
      "label": "CN — Container"
    },
    {
      "code": "PC",
      "label": "PC — Piece"
    },
    {
      "code": "BL",
      "label": "BL — Bale"
    }
  ],
  "incoterms": [
    {
      "code": "FOB",
      "label": "FOB — Free On Board"
    },
    {
      "code": "CFR",
      "label": "CFR — Cost & Freight"
    },
    {
      "code": "CIF",
      "label": "CIF — Cost, Insurance & Freight"
    },
    {
      "code": "EXW",
      "label": "EXW — Ex Works"
    },
    {
      "code": "DAP",
      "label": "DAP — Delivered At Place"
    },
    {
      "code": "DDP",
      "label": "DDP — Delivered Duty Paid"
    },
    {
      "code": "FCA",
      "label": "FCA — Free Carrier"
    },
    {
      "code": "CPT",
      "label": "CPT — Carriage Paid To"
    },
    {
      "code": "CIP",
      "label": "CIP — Carriage & Insurance Paid"
    }
  ],
  "ports": [
    {
      "code": "TTPOS",
      "label": "Port of Spain"
    },
    {
      "code": "TTPTS",
      "label": "Point Lisas"
    },
    {
      "code": "TTPIA",
      "label": "Piarco (Air)"
    },
    {
      "code": "TTSCA",
      "label": "Scarborough (Tobago)"
    },
    {
      "code": "TTPNT",
      "label": "Point Fortin"
    },
    {
      "code": "TTGAL",
      "label": "Galeota"
    }
  ],
  "customs_regimes": [
    {
      "code": "C4",
      "label": "C4 — Home Use (IM4)"
    },
    {
      "code": "C7",
      "label": "C7 — Warehousing (IM7)"
    },
    {
      "code": "C5",
      "label": "C5 — Temporary Import (IM5)"
    },
    {
      "code": "E1",
      "label": "E1 — Permanent Export (EX1)"
    },
    {
      "code": "E2",
      "label": "E2 — Temporary Export (EX2)"
    },
    {
      "code": "E3",
      "label": "E3 — Re-Export (EX3)"
    }
  ],
  "supplementary_units": [
    {
      "code": "",
      "label": "— none —"
    },
    {
      "code": "NMB",
      "label": "NMB — Number (units)"
    },
    {
      "code": "KGM",
      "label": "KGM — Kilograms"
    },
    {
      "code": "LTR",
      "label": "LTR — Litres"
    },
    {
      "code": "MTR",
      "label": "MTR — Metres"
    },
    {
      "code": "MTK",
      "label": "MTK — Square metres"
    },
    {
      "code": "PR",
      "label": "PR — Pairs"
    },
    {
      "code": "DZN",
      "label": "DZN — Dozen"
    }
  ]
}
