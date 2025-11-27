# Supported Languages

tstlai supports a wide range of languages, categorized by translation proficiency tier (based on AI model capabilities).

## Tier 1: High Proficiency
These languages have the highest quality of translation and nuance preservation.

| Code | Language | Region |
|------|----------|--------|
| `en_US` | English | United States |
| `en_GB` | English | United Kingdom |
| `de_DE` | German | Germany |
| `es_ES` | Spanish | Spain |
| `es_MX` | Spanish | Mexico |
| `fr_FR` | French | France |
| `it_IT` | Italian | Italy |
| `ja_JP` | Japanese | Japan |
| `pt_BR` | Portuguese | Brazil |
| `pt_PT` | Portuguese | Portugal |
| `zh_CN` | Chinese | Simplified |
| `zh_TW` | Chinese | Traditional |

## Tier 2: Good Proficiency
Translations are accurate and grammatically correct, suitable for production use.

| Code | Language | Region |
|------|----------|--------|
| `ar_SA` | Arabic | Saudi Arabia (RTL) |
| `bn_BD` | Bengali | Bangladesh |
| `cs_CZ` | Czech | Czech Republic |
| `da_DK` | Danish | Denmark |
| `el_GR` | Greek | Greece |
| `fi_FI` | Finnish | Finland |
| `he_IL` | Hebrew | Israel (RTL) |
| `hi_IN` | Hindi | India |
| `hu_HU` | Hungarian | Hungary |
| `id_ID` | Indonesian | Indonesia |
| `ko_KR` | Korean | South Korea |
| `nl_NL` | Dutch | Netherlands |
| `nb_NO` | Norwegian | Norway |
| `pl_PL` | Polish | Poland |
| `ro_RO` | Romanian | Romania |
| `ru_RU` | Russian | Russia |
| `sv_SE` | Swedish | Sweden |
| `th_TH` | Thai | Thailand |
| `tr_TR` | Turkish | Turkey |
| `uk_UA` | Ukrainian | Ukraine |
| `vi_VN` | Vietnamese | Vietnam |

## Tier 3: Functional Proficiency
Translations are understandable but may lack idiomatic nuance.

| Code | Language | Region |
|------|----------|--------|
| `bg_BG` | Bulgarian | Bulgaria |
| `ca_ES` | Catalan | Spain |
| `fa_IR` | Persian | Iran (RTL) |
| `hr_HR` | Croatian | Croatia |
| `lt_LT` | Lithuanian | Lithuania |
| `lv_LV` | Latvian | Latvia |
| `ms_MY` | Malay | Malaysia |
| `sk_SK` | Slovak | Slovakia |
| `sl_SI` | Slovenian | Slovenia |
| `sr_RS` | Serbian | Serbia |
| `sw_KE` | Swahili | Kenya |
| `tl_PH` | Tagalog | Philippines |
| `ur_PK` | Urdu | Pakistan (RTL) |

## Fallback Codes
You can also use 2-letter ISO codes, which default to the standard dialect.

- `en` → English
- `es` → Spanish
- `fr` → French
- `de` → German
- `it` → Italian
- `pt` → Portuguese
- `zh` → Chinese
- `ja` → Japanese
- `ru` → Russian
- `ko` → Korean

## Right-to-Left (RTL) Support
tstlai automatically detects RTL languages and sets the `dir="rtl"` attribute on the `<html>` tag for:
- Arabic (`ar`)
- Hebrew (`he`)
- Persian (`fa`)
- Urdu (`ur`)
- Pashto (`ps`)
- Sindhi (`sd`)
- Uyghur (`ug`)
