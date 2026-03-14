// Country code data for phone number input
import { APP_CONFIG } from "./config";

export interface CountryCode {
  code: string;   // e.g., "+62"
  dial: string;   // e.g., "62"
  country: string; // e.g., "Indonesia"
  flag: string;    // ISO 3166-1 alpha-2, e.g., "ID"
  emoji: string;   // flag emoji
  maxDigits: number; // max local phone digits (without country code)
}

// Helper to convert ISO alpha-2 to flag emoji
function toFlagEmoji(iso: string): string {
  return [...iso.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

// Complete list of all countries with calling codes
export const COUNTRY_CODES: CountryCode[] = [
  // --- Priority / common countries first ---
  { code: "+62",  dial: "62",  country: "Indonesia",              flag: "ID", emoji: toFlagEmoji("ID"), maxDigits: 12 },
  { code: "+91",  dial: "91",  country: "India",                  flag: "IN", emoji: toFlagEmoji("IN"), maxDigits: 10 },
  { code: "+1",   dial: "1",   country: "United States",          flag: "US", emoji: toFlagEmoji("US"), maxDigits: 10 },
  { code: "+44",  dial: "44",  country: "United Kingdom",         flag: "GB", emoji: toFlagEmoji("GB"), maxDigits: 10 },
  { code: "+60",  dial: "60",  country: "Malaysia",               flag: "MY", emoji: toFlagEmoji("MY"), maxDigits: 11 },
  { code: "+65",  dial: "65",  country: "Singapore",              flag: "SG", emoji: toFlagEmoji("SG"), maxDigits: 8  },
  { code: "+61",  dial: "61",  country: "Australia",              flag: "AU", emoji: toFlagEmoji("AU"), maxDigits: 9  },
  { code: "+81",  dial: "81",  country: "Japan",                  flag: "JP", emoji: toFlagEmoji("JP"), maxDigits: 10 },
  { code: "+82",  dial: "82",  country: "South Korea",            flag: "KR", emoji: toFlagEmoji("KR"), maxDigits: 10 },
  { code: "+86",  dial: "86",  country: "China",                  flag: "CN", emoji: toFlagEmoji("CN"), maxDigits: 11 },
  { code: "+971", dial: "971", country: "United Arab Emirates",   flag: "AE", emoji: toFlagEmoji("AE"), maxDigits: 9  },

  // --- A ---
  { code: "+93",  dial: "93",  country: "Afghanistan",            flag: "AF", emoji: toFlagEmoji("AF"), maxDigits: 9  },
  { code: "+355", dial: "355", country: "Albania",                flag: "AL", emoji: toFlagEmoji("AL"), maxDigits: 9  },
  { code: "+213", dial: "213", country: "Algeria",                flag: "DZ", emoji: toFlagEmoji("DZ"), maxDigits: 9  },
  { code: "+1684",dial:"1684", country: "American Samoa",         flag: "AS", emoji: toFlagEmoji("AS"), maxDigits: 7  },
  { code: "+376", dial: "376", country: "Andorra",                flag: "AD", emoji: toFlagEmoji("AD"), maxDigits: 6  },
  { code: "+244", dial: "244", country: "Angola",                 flag: "AO", emoji: toFlagEmoji("AO"), maxDigits: 9  },
  { code: "+1264",dial:"1264", country: "Anguilla",               flag: "AI", emoji: toFlagEmoji("AI"), maxDigits: 7  },
  { code: "+1268",dial:"1268", country: "Antigua and Barbuda",    flag: "AG", emoji: toFlagEmoji("AG"), maxDigits: 7  },
  { code: "+54",  dial: "54",  country: "Argentina",              flag: "AR", emoji: toFlagEmoji("AR"), maxDigits: 10 },
  { code: "+374", dial: "374", country: "Armenia",                flag: "AM", emoji: toFlagEmoji("AM"), maxDigits: 8  },
  { code: "+297", dial: "297", country: "Aruba",                  flag: "AW", emoji: toFlagEmoji("AW"), maxDigits: 7  },
  { code: "+43",  dial: "43",  country: "Austria",                flag: "AT", emoji: toFlagEmoji("AT"), maxDigits: 11 },
  { code: "+994", dial: "994", country: "Azerbaijan",             flag: "AZ", emoji: toFlagEmoji("AZ"), maxDigits: 9  },

  // --- B ---
  { code: "+1242",dial:"1242", country: "Bahamas",                flag: "BS", emoji: toFlagEmoji("BS"), maxDigits: 7  },
  { code: "+973", dial: "973", country: "Bahrain",                flag: "BH", emoji: toFlagEmoji("BH"), maxDigits: 8  },
  { code: "+880", dial: "880", country: "Bangladesh",             flag: "BD", emoji: toFlagEmoji("BD"), maxDigits: 10 },
  { code: "+1246",dial:"1246", country: "Barbados",               flag: "BB", emoji: toFlagEmoji("BB"), maxDigits: 7  },
  { code: "+375", dial: "375", country: "Belarus",                flag: "BY", emoji: toFlagEmoji("BY"), maxDigits: 10 },
  { code: "+32",  dial: "32",  country: "Belgium",                flag: "BE", emoji: toFlagEmoji("BE"), maxDigits: 9  },
  { code: "+501", dial: "501", country: "Belize",                 flag: "BZ", emoji: toFlagEmoji("BZ"), maxDigits: 7  },
  { code: "+229", dial: "229", country: "Benin",                  flag: "BJ", emoji: toFlagEmoji("BJ"), maxDigits: 8  },
  { code: "+1441",dial:"1441", country: "Bermuda",                flag: "BM", emoji: toFlagEmoji("BM"), maxDigits: 7  },
  { code: "+975", dial: "975", country: "Bhutan",                 flag: "BT", emoji: toFlagEmoji("BT"), maxDigits: 8  },
  { code: "+591", dial: "591", country: "Bolivia",                flag: "BO", emoji: toFlagEmoji("BO"), maxDigits: 8  },
  { code: "+387", dial: "387", country: "Bosnia and Herzegovina", flag: "BA", emoji: toFlagEmoji("BA"), maxDigits: 8  },
  { code: "+267", dial: "267", country: "Botswana",               flag: "BW", emoji: toFlagEmoji("BW"), maxDigits: 8  },
  { code: "+55",  dial: "55",  country: "Brazil",                 flag: "BR", emoji: toFlagEmoji("BR"), maxDigits: 11 },
  { code: "+673", dial: "673", country: "Brunei",                 flag: "BN", emoji: toFlagEmoji("BN"), maxDigits: 7  },
  { code: "+359", dial: "359", country: "Bulgaria",               flag: "BG", emoji: toFlagEmoji("BG"), maxDigits: 9  },
  { code: "+226", dial: "226", country: "Burkina Faso",           flag: "BF", emoji: toFlagEmoji("BF"), maxDigits: 8  },
  { code: "+257", dial: "257", country: "Burundi",                flag: "BI", emoji: toFlagEmoji("BI"), maxDigits: 8  },

  // --- C ---
  { code: "+855", dial: "855", country: "Cambodia",               flag: "KH", emoji: toFlagEmoji("KH"), maxDigits: 9  },
  { code: "+237", dial: "237", country: "Cameroon",               flag: "CM", emoji: toFlagEmoji("CM"), maxDigits: 9  },
  { code: "+1",   dial: "1",   country: "Canada",                 flag: "CA", emoji: toFlagEmoji("CA"), maxDigits: 10 },
  { code: "+238", dial: "238", country: "Cape Verde",             flag: "CV", emoji: toFlagEmoji("CV"), maxDigits: 7  },
  { code: "+1345",dial:"1345", country: "Cayman Islands",         flag: "KY", emoji: toFlagEmoji("KY"), maxDigits: 7  },
  { code: "+236", dial: "236", country: "Central African Republic",flag:"CF", emoji: toFlagEmoji("CF"), maxDigits: 8  },
  { code: "+235", dial: "235", country: "Chad",                   flag: "TD", emoji: toFlagEmoji("TD"), maxDigits: 8  },
  { code: "+56",  dial: "56",  country: "Chile",                  flag: "CL", emoji: toFlagEmoji("CL"), maxDigits: 9  },
  { code: "+57",  dial: "57",  country: "Colombia",               flag: "CO", emoji: toFlagEmoji("CO"), maxDigits: 10 },
  { code: "+269", dial: "269", country: "Comoros",                flag: "KM", emoji: toFlagEmoji("KM"), maxDigits: 7  },
  { code: "+242", dial: "242", country: "Congo",                  flag: "CG", emoji: toFlagEmoji("CG"), maxDigits: 9  },
  { code: "+243", dial: "243", country: "Congo (DRC)",            flag: "CD", emoji: toFlagEmoji("CD"), maxDigits: 9  },
  { code: "+682", dial: "682", country: "Cook Islands",           flag: "CK", emoji: toFlagEmoji("CK"), maxDigits: 5  },
  { code: "+506", dial: "506", country: "Costa Rica",             flag: "CR", emoji: toFlagEmoji("CR"), maxDigits: 8  },
  { code: "+225", dial: "225", country: "Cote d'Ivoire",          flag: "CI", emoji: toFlagEmoji("CI"), maxDigits: 10 },
  { code: "+385", dial: "385", country: "Croatia",                flag: "HR", emoji: toFlagEmoji("HR"), maxDigits: 9  },
  { code: "+53",  dial: "53",  country: "Cuba",                   flag: "CU", emoji: toFlagEmoji("CU"), maxDigits: 8  },
  { code: "+599", dial: "599", country: "Curacao",                flag: "CW", emoji: toFlagEmoji("CW"), maxDigits: 8  },
  { code: "+357", dial: "357", country: "Cyprus",                 flag: "CY", emoji: toFlagEmoji("CY"), maxDigits: 8  },
  { code: "+420", dial: "420", country: "Czech Republic",         flag: "CZ", emoji: toFlagEmoji("CZ"), maxDigits: 9  },

  // --- D ---
  { code: "+45",  dial: "45",  country: "Denmark",                flag: "DK", emoji: toFlagEmoji("DK"), maxDigits: 8  },
  { code: "+253", dial: "253", country: "Djibouti",               flag: "DJ", emoji: toFlagEmoji("DJ"), maxDigits: 8  },
  { code: "+1767",dial:"1767", country: "Dominica",               flag: "DM", emoji: toFlagEmoji("DM"), maxDigits: 7  },
  { code: "+1809",dial:"1809", country: "Dominican Republic",     flag: "DO", emoji: toFlagEmoji("DO"), maxDigits: 7  },

  // --- E ---
  { code: "+593", dial: "593", country: "Ecuador",                flag: "EC", emoji: toFlagEmoji("EC"), maxDigits: 9  },
  { code: "+20",  dial: "20",  country: "Egypt",                  flag: "EG", emoji: toFlagEmoji("EG"), maxDigits: 10 },
  { code: "+503", dial: "503", country: "El Salvador",            flag: "SV", emoji: toFlagEmoji("SV"), maxDigits: 8  },
  { code: "+240", dial: "240", country: "Equatorial Guinea",      flag: "GQ", emoji: toFlagEmoji("GQ"), maxDigits: 9  },
  { code: "+291", dial: "291", country: "Eritrea",                flag: "ER", emoji: toFlagEmoji("ER"), maxDigits: 7  },
  { code: "+372", dial: "372", country: "Estonia",                flag: "EE", emoji: toFlagEmoji("EE"), maxDigits: 8  },
  { code: "+268", dial: "268", country: "Eswatini",               flag: "SZ", emoji: toFlagEmoji("SZ"), maxDigits: 8  },
  { code: "+251", dial: "251", country: "Ethiopia",               flag: "ET", emoji: toFlagEmoji("ET"), maxDigits: 9  },

  // --- F ---
  { code: "+500", dial: "500", country: "Falkland Islands",       flag: "FK", emoji: toFlagEmoji("FK"), maxDigits: 5  },
  { code: "+298", dial: "298", country: "Faroe Islands",          flag: "FO", emoji: toFlagEmoji("FO"), maxDigits: 6  },
  { code: "+679", dial: "679", country: "Fiji",                   flag: "FJ", emoji: toFlagEmoji("FJ"), maxDigits: 7  },
  { code: "+358", dial: "358", country: "Finland",                flag: "FI", emoji: toFlagEmoji("FI"), maxDigits: 10 },
  { code: "+33",  dial: "33",  country: "France",                 flag: "FR", emoji: toFlagEmoji("FR"), maxDigits: 9  },
  { code: "+594", dial: "594", country: "French Guiana",          flag: "GF", emoji: toFlagEmoji("GF"), maxDigits: 9  },
  { code: "+689", dial: "689", country: "French Polynesia",       flag: "PF", emoji: toFlagEmoji("PF"), maxDigits: 6  },

  // --- G ---
  { code: "+241", dial: "241", country: "Gabon",                  flag: "GA", emoji: toFlagEmoji("GA"), maxDigits: 8  },
  { code: "+220", dial: "220", country: "Gambia",                 flag: "GM", emoji: toFlagEmoji("GM"), maxDigits: 7  },
  { code: "+995", dial: "995", country: "Georgia",                flag: "GE", emoji: toFlagEmoji("GE"), maxDigits: 9  },
  { code: "+49",  dial: "49",  country: "Germany",                flag: "DE", emoji: toFlagEmoji("DE"), maxDigits: 11 },
  { code: "+233", dial: "233", country: "Ghana",                  flag: "GH", emoji: toFlagEmoji("GH"), maxDigits: 9  },
  { code: "+350", dial: "350", country: "Gibraltar",              flag: "GI", emoji: toFlagEmoji("GI"), maxDigits: 8  },
  { code: "+30",  dial: "30",  country: "Greece",                 flag: "GR", emoji: toFlagEmoji("GR"), maxDigits: 10 },
  { code: "+299", dial: "299", country: "Greenland",              flag: "GL", emoji: toFlagEmoji("GL"), maxDigits: 6  },
  { code: "+1473",dial:"1473", country: "Grenada",                flag: "GD", emoji: toFlagEmoji("GD"), maxDigits: 7  },
  { code: "+590", dial: "590", country: "Guadeloupe",             flag: "GP", emoji: toFlagEmoji("GP"), maxDigits: 9  },
  { code: "+1671",dial:"1671", country: "Guam",                   flag: "GU", emoji: toFlagEmoji("GU"), maxDigits: 7  },
  { code: "+502", dial: "502", country: "Guatemala",              flag: "GT", emoji: toFlagEmoji("GT"), maxDigits: 8  },
  { code: "+224", dial: "224", country: "Guinea",                 flag: "GN", emoji: toFlagEmoji("GN"), maxDigits: 9  },
  { code: "+245", dial: "245", country: "Guinea-Bissau",          flag: "GW", emoji: toFlagEmoji("GW"), maxDigits: 9  },
  { code: "+592", dial: "592", country: "Guyana",                 flag: "GY", emoji: toFlagEmoji("GY"), maxDigits: 7  },

  // --- H ---
  { code: "+509", dial: "509", country: "Haiti",                  flag: "HT", emoji: toFlagEmoji("HT"), maxDigits: 8  },
  { code: "+504", dial: "504", country: "Honduras",               flag: "HN", emoji: toFlagEmoji("HN"), maxDigits: 8  },
  { code: "+852", dial: "852", country: "Hong Kong",              flag: "HK", emoji: toFlagEmoji("HK"), maxDigits: 8  },
  { code: "+36",  dial: "36",  country: "Hungary",                flag: "HU", emoji: toFlagEmoji("HU"), maxDigits: 9  },

  // --- I ---
  { code: "+354", dial: "354", country: "Iceland",                flag: "IS", emoji: toFlagEmoji("IS"), maxDigits: 7  },
  { code: "+98",  dial: "98",  country: "Iran",                   flag: "IR", emoji: toFlagEmoji("IR"), maxDigits: 10 },
  { code: "+964", dial: "964", country: "Iraq",                   flag: "IQ", emoji: toFlagEmoji("IQ"), maxDigits: 10 },
  { code: "+353", dial: "353", country: "Ireland",                flag: "IE", emoji: toFlagEmoji("IE"), maxDigits: 9  },
  { code: "+972", dial: "972", country: "Israel",                 flag: "IL", emoji: toFlagEmoji("IL"), maxDigits: 9  },
  { code: "+39",  dial: "39",  country: "Italy",                  flag: "IT", emoji: toFlagEmoji("IT"), maxDigits: 10 },

  // --- J ---
  { code: "+1876",dial:"1876", country: "Jamaica",                flag: "JM", emoji: toFlagEmoji("JM"), maxDigits: 7  },
  { code: "+962", dial: "962", country: "Jordan",                 flag: "JO", emoji: toFlagEmoji("JO"), maxDigits: 9  },

  // --- K ---
  { code: "+7",   dial: "7",   country: "Kazakhstan",             flag: "KZ", emoji: toFlagEmoji("KZ"), maxDigits: 10 },
  { code: "+254", dial: "254", country: "Kenya",                  flag: "KE", emoji: toFlagEmoji("KE"), maxDigits: 10 },
  { code: "+686", dial: "686", country: "Kiribati",               flag: "KI", emoji: toFlagEmoji("KI"), maxDigits: 8  },
  { code: "+383", dial: "383", country: "Kosovo",                 flag: "XK", emoji: toFlagEmoji("XK"), maxDigits: 8  },
  { code: "+965", dial: "965", country: "Kuwait",                 flag: "KW", emoji: toFlagEmoji("KW"), maxDigits: 8  },
  { code: "+996", dial: "996", country: "Kyrgyzstan",             flag: "KG", emoji: toFlagEmoji("KG"), maxDigits: 9  },

  // --- L ---
  { code: "+856", dial: "856", country: "Laos",                   flag: "LA", emoji: toFlagEmoji("LA"), maxDigits: 10 },
  { code: "+371", dial: "371", country: "Latvia",                 flag: "LV", emoji: toFlagEmoji("LV"), maxDigits: 8  },
  { code: "+961", dial: "961", country: "Lebanon",                flag: "LB", emoji: toFlagEmoji("LB"), maxDigits: 8  },
  { code: "+266", dial: "266", country: "Lesotho",                flag: "LS", emoji: toFlagEmoji("LS"), maxDigits: 8  },
  { code: "+231", dial: "231", country: "Liberia",                flag: "LR", emoji: toFlagEmoji("LR"), maxDigits: 9  },
  { code: "+218", dial: "218", country: "Libya",                  flag: "LY", emoji: toFlagEmoji("LY"), maxDigits: 10 },
  { code: "+423", dial: "423", country: "Liechtenstein",          flag: "LI", emoji: toFlagEmoji("LI"), maxDigits: 7  },
  { code: "+370", dial: "370", country: "Lithuania",              flag: "LT", emoji: toFlagEmoji("LT"), maxDigits: 8  },
  { code: "+352", dial: "352", country: "Luxembourg",             flag: "LU", emoji: toFlagEmoji("LU"), maxDigits: 9  },

  // --- M ---
  { code: "+853", dial: "853", country: "Macau",                  flag: "MO", emoji: toFlagEmoji("MO"), maxDigits: 8  },
  { code: "+261", dial: "261", country: "Madagascar",             flag: "MG", emoji: toFlagEmoji("MG"), maxDigits: 10 },
  { code: "+265", dial: "265", country: "Malawi",                 flag: "MW", emoji: toFlagEmoji("MW"), maxDigits: 9  },
  { code: "+960", dial: "960", country: "Maldives",               flag: "MV", emoji: toFlagEmoji("MV"), maxDigits: 7  },
  { code: "+223", dial: "223", country: "Mali",                   flag: "ML", emoji: toFlagEmoji("ML"), maxDigits: 8  },
  { code: "+356", dial: "356", country: "Malta",                  flag: "MT", emoji: toFlagEmoji("MT"), maxDigits: 8  },
  { code: "+692", dial: "692", country: "Marshall Islands",       flag: "MH", emoji: toFlagEmoji("MH"), maxDigits: 7  },
  { code: "+596", dial: "596", country: "Martinique",             flag: "MQ", emoji: toFlagEmoji("MQ"), maxDigits: 9  },
  { code: "+222", dial: "222", country: "Mauritania",             flag: "MR", emoji: toFlagEmoji("MR"), maxDigits: 8  },
  { code: "+230", dial: "230", country: "Mauritius",              flag: "MU", emoji: toFlagEmoji("MU"), maxDigits: 8  },
  { code: "+262", dial: "262", country: "Mayotte",                flag: "YT", emoji: toFlagEmoji("YT"), maxDigits: 9  },
  { code: "+52",  dial: "52",  country: "Mexico",                 flag: "MX", emoji: toFlagEmoji("MX"), maxDigits: 10 },
  { code: "+691", dial: "691", country: "Micronesia",             flag: "FM", emoji: toFlagEmoji("FM"), maxDigits: 7  },
  { code: "+373", dial: "373", country: "Moldova",                flag: "MD", emoji: toFlagEmoji("MD"), maxDigits: 8  },
  { code: "+377", dial: "377", country: "Monaco",                 flag: "MC", emoji: toFlagEmoji("MC"), maxDigits: 8  },
  { code: "+976", dial: "976", country: "Mongolia",               flag: "MN", emoji: toFlagEmoji("MN"), maxDigits: 8  },
  { code: "+382", dial: "382", country: "Montenegro",             flag: "ME", emoji: toFlagEmoji("ME"), maxDigits: 8  },
  { code: "+1664",dial:"1664", country: "Montserrat",             flag: "MS", emoji: toFlagEmoji("MS"), maxDigits: 7  },
  { code: "+212", dial: "212", country: "Morocco",                flag: "MA", emoji: toFlagEmoji("MA"), maxDigits: 9  },
  { code: "+258", dial: "258", country: "Mozambique",             flag: "MZ", emoji: toFlagEmoji("MZ"), maxDigits: 9  },
  { code: "+95",  dial: "95",  country: "Myanmar",                flag: "MM", emoji: toFlagEmoji("MM"), maxDigits: 10 },

  // --- N ---
  { code: "+264", dial: "264", country: "Namibia",                flag: "NA", emoji: toFlagEmoji("NA"), maxDigits: 10 },
  { code: "+674", dial: "674", country: "Nauru",                  flag: "NR", emoji: toFlagEmoji("NR"), maxDigits: 7  },
  { code: "+977", dial: "977", country: "Nepal",                  flag: "NP", emoji: toFlagEmoji("NP"), maxDigits: 10 },
  { code: "+31",  dial: "31",  country: "Netherlands",            flag: "NL", emoji: toFlagEmoji("NL"), maxDigits: 9  },
  { code: "+687", dial: "687", country: "New Caledonia",          flag: "NC", emoji: toFlagEmoji("NC"), maxDigits: 6  },
  { code: "+64",  dial: "64",  country: "New Zealand",            flag: "NZ", emoji: toFlagEmoji("NZ"), maxDigits: 10 },
  { code: "+505", dial: "505", country: "Nicaragua",              flag: "NI", emoji: toFlagEmoji("NI"), maxDigits: 8  },
  { code: "+227", dial: "227", country: "Niger",                  flag: "NE", emoji: toFlagEmoji("NE"), maxDigits: 8  },
  { code: "+234", dial: "234", country: "Nigeria",                flag: "NG", emoji: toFlagEmoji("NG"), maxDigits: 10 },
  { code: "+683", dial: "683", country: "Niue",                   flag: "NU", emoji: toFlagEmoji("NU"), maxDigits: 4  },
  { code: "+672", dial: "672", country: "Norfolk Island",         flag: "NF", emoji: toFlagEmoji("NF"), maxDigits: 6  },
  { code: "+850", dial: "850", country: "North Korea",            flag: "KP", emoji: toFlagEmoji("KP"), maxDigits: 10 },
  { code: "+389", dial: "389", country: "North Macedonia",        flag: "MK", emoji: toFlagEmoji("MK"), maxDigits: 8  },
  { code: "+1670",dial:"1670", country: "Northern Mariana Islands",flag:"MP", emoji: toFlagEmoji("MP"), maxDigits: 7  },
  { code: "+47",  dial: "47",  country: "Norway",                 flag: "NO", emoji: toFlagEmoji("NO"), maxDigits: 8  },

  // --- O ---
  { code: "+968", dial: "968", country: "Oman",                   flag: "OM", emoji: toFlagEmoji("OM"), maxDigits: 8  },

  // --- P ---
  { code: "+92",  dial: "92",  country: "Pakistan",               flag: "PK", emoji: toFlagEmoji("PK"), maxDigits: 10 },
  { code: "+680", dial: "680", country: "Palau",                  flag: "PW", emoji: toFlagEmoji("PW"), maxDigits: 7  },
  { code: "+970", dial: "970", country: "Palestine",              flag: "PS", emoji: toFlagEmoji("PS"), maxDigits: 9  },
  { code: "+507", dial: "507", country: "Panama",                 flag: "PA", emoji: toFlagEmoji("PA"), maxDigits: 8  },
  { code: "+675", dial: "675", country: "Papua New Guinea",       flag: "PG", emoji: toFlagEmoji("PG"), maxDigits: 8  },
  { code: "+595", dial: "595", country: "Paraguay",               flag: "PY", emoji: toFlagEmoji("PY"), maxDigits: 9  },
  { code: "+51",  dial: "51",  country: "Peru",                   flag: "PE", emoji: toFlagEmoji("PE"), maxDigits: 9  },
  { code: "+63",  dial: "63",  country: "Philippines",            flag: "PH", emoji: toFlagEmoji("PH"), maxDigits: 10 },
  { code: "+48",  dial: "48",  country: "Poland",                 flag: "PL", emoji: toFlagEmoji("PL"), maxDigits: 9  },
  { code: "+351", dial: "351", country: "Portugal",               flag: "PT", emoji: toFlagEmoji("PT"), maxDigits: 9  },
  { code: "+1787",dial:"1787", country: "Puerto Rico",            flag: "PR", emoji: toFlagEmoji("PR"), maxDigits: 7  },

  // --- Q ---
  { code: "+974", dial: "974", country: "Qatar",                  flag: "QA", emoji: toFlagEmoji("QA"), maxDigits: 8  },

  // --- R ---
  { code: "+262", dial: "262", country: "Reunion",                flag: "RE", emoji: toFlagEmoji("RE"), maxDigits: 9  },
  { code: "+40",  dial: "40",  country: "Romania",                flag: "RO", emoji: toFlagEmoji("RO"), maxDigits: 9  },
  { code: "+7",   dial: "7",   country: "Russia",                 flag: "RU", emoji: toFlagEmoji("RU"), maxDigits: 10 },
  { code: "+250", dial: "250", country: "Rwanda",                 flag: "RW", emoji: toFlagEmoji("RW"), maxDigits: 9  },

  // --- S ---
  { code: "+685", dial: "685", country: "Samoa",                  flag: "WS", emoji: toFlagEmoji("WS"), maxDigits: 7  },
  { code: "+378", dial: "378", country: "San Marino",             flag: "SM", emoji: toFlagEmoji("SM"), maxDigits: 10 },
  { code: "+239", dial: "239", country: "Sao Tome and Principe",  flag: "ST", emoji: toFlagEmoji("ST"), maxDigits: 7  },
  { code: "+966", dial: "966", country: "Saudi Arabia",           flag: "SA", emoji: toFlagEmoji("SA"), maxDigits: 9  },
  { code: "+221", dial: "221", country: "Senegal",                flag: "SN", emoji: toFlagEmoji("SN"), maxDigits: 9  },
  { code: "+381", dial: "381", country: "Serbia",                 flag: "RS", emoji: toFlagEmoji("RS"), maxDigits: 9  },
  { code: "+248", dial: "248", country: "Seychelles",             flag: "SC", emoji: toFlagEmoji("SC"), maxDigits: 7  },
  { code: "+232", dial: "232", country: "Sierra Leone",           flag: "SL", emoji: toFlagEmoji("SL"), maxDigits: 8  },
  { code: "+421", dial: "421", country: "Slovakia",               flag: "SK", emoji: toFlagEmoji("SK"), maxDigits: 9  },
  { code: "+386", dial: "386", country: "Slovenia",               flag: "SI", emoji: toFlagEmoji("SI"), maxDigits: 8  },
  { code: "+677", dial: "677", country: "Solomon Islands",        flag: "SB", emoji: toFlagEmoji("SB"), maxDigits: 7  },
  { code: "+252", dial: "252", country: "Somalia",                flag: "SO", emoji: toFlagEmoji("SO"), maxDigits: 8  },
  { code: "+27",  dial: "27",  country: "South Africa",           flag: "ZA", emoji: toFlagEmoji("ZA"), maxDigits: 9  },
  { code: "+211", dial: "211", country: "South Sudan",            flag: "SS", emoji: toFlagEmoji("SS"), maxDigits: 9  },
  { code: "+34",  dial: "34",  country: "Spain",                  flag: "ES", emoji: toFlagEmoji("ES"), maxDigits: 9  },
  { code: "+94",  dial: "94",  country: "Sri Lanka",              flag: "LK", emoji: toFlagEmoji("LK"), maxDigits: 9  },
  { code: "+1869",dial:"1869", country: "St. Kitts and Nevis",    flag: "KN", emoji: toFlagEmoji("KN"), maxDigits: 7  },
  { code: "+1758",dial:"1758", country: "St. Lucia",              flag: "LC", emoji: toFlagEmoji("LC"), maxDigits: 7  },
  { code: "+1784",dial:"1784", country: "St. Vincent & Grenadines",flag:"VC", emoji: toFlagEmoji("VC"), maxDigits: 7  },
  { code: "+249", dial: "249", country: "Sudan",                  flag: "SD", emoji: toFlagEmoji("SD"), maxDigits: 9  },
  { code: "+597", dial: "597", country: "Suriname",               flag: "SR", emoji: toFlagEmoji("SR"), maxDigits: 7  },
  { code: "+46",  dial: "46",  country: "Sweden",                 flag: "SE", emoji: toFlagEmoji("SE"), maxDigits: 10 },
  { code: "+41",  dial: "41",  country: "Switzerland",            flag: "CH", emoji: toFlagEmoji("CH"), maxDigits: 9  },
  { code: "+963", dial: "963", country: "Syria",                  flag: "SY", emoji: toFlagEmoji("SY"), maxDigits: 9  },

  // --- T ---
  { code: "+886", dial: "886", country: "Taiwan",                 flag: "TW", emoji: toFlagEmoji("TW"), maxDigits: 9  },
  { code: "+992", dial: "992", country: "Tajikistan",             flag: "TJ", emoji: toFlagEmoji("TJ"), maxDigits: 9  },
  { code: "+255", dial: "255", country: "Tanzania",               flag: "TZ", emoji: toFlagEmoji("TZ"), maxDigits: 9  },
  { code: "+66",  dial: "66",  country: "Thailand",               flag: "TH", emoji: toFlagEmoji("TH"), maxDigits: 9  },
  { code: "+670", dial: "670", country: "Timor-Leste",            flag: "TL", emoji: toFlagEmoji("TL"), maxDigits: 8  },
  { code: "+228", dial: "228", country: "Togo",                   flag: "TG", emoji: toFlagEmoji("TG"), maxDigits: 8  },
  { code: "+690", dial: "690", country: "Tokelau",                flag: "TK", emoji: toFlagEmoji("TK"), maxDigits: 4  },
  { code: "+676", dial: "676", country: "Tonga",                  flag: "TO", emoji: toFlagEmoji("TO"), maxDigits: 7  },
  { code: "+1868",dial:"1868", country: "Trinidad and Tobago",    flag: "TT", emoji: toFlagEmoji("TT"), maxDigits: 7  },
  { code: "+216", dial: "216", country: "Tunisia",                flag: "TN", emoji: toFlagEmoji("TN"), maxDigits: 8  },
  { code: "+90",  dial: "90",  country: "Turkey",                 flag: "TR", emoji: toFlagEmoji("TR"), maxDigits: 10 },
  { code: "+993", dial: "993", country: "Turkmenistan",           flag: "TM", emoji: toFlagEmoji("TM"), maxDigits: 8  },
  { code: "+1649",dial:"1649", country: "Turks and Caicos",       flag: "TC", emoji: toFlagEmoji("TC"), maxDigits: 7  },
  { code: "+688", dial: "688", country: "Tuvalu",                 flag: "TV", emoji: toFlagEmoji("TV"), maxDigits: 6  },

  // --- U ---
  { code: "+256", dial: "256", country: "Uganda",                 flag: "UG", emoji: toFlagEmoji("UG"), maxDigits: 9  },
  { code: "+380", dial: "380", country: "Ukraine",                flag: "UA", emoji: toFlagEmoji("UA"), maxDigits: 9  },
  { code: "+598", dial: "598", country: "Uruguay",                flag: "UY", emoji: toFlagEmoji("UY"), maxDigits: 9  },
  { code: "+998", dial: "998", country: "Uzbekistan",             flag: "UZ", emoji: toFlagEmoji("UZ"), maxDigits: 9  },

  // --- V ---
  { code: "+678", dial: "678", country: "Vanuatu",                flag: "VU", emoji: toFlagEmoji("VU"), maxDigits: 7  },
  { code: "+379", dial: "379", country: "Vatican City",           flag: "VA", emoji: toFlagEmoji("VA"), maxDigits: 10 },
  { code: "+58",  dial: "58",  country: "Venezuela",              flag: "VE", emoji: toFlagEmoji("VE"), maxDigits: 10 },
  { code: "+84",  dial: "84",  country: "Vietnam",                flag: "VN", emoji: toFlagEmoji("VN"), maxDigits: 10 },
  { code: "+1284",dial:"1284", country: "British Virgin Islands", flag: "VG", emoji: toFlagEmoji("VG"), maxDigits: 7  },
  { code: "+1340",dial:"1340", country: "US Virgin Islands",      flag: "VI", emoji: toFlagEmoji("VI"), maxDigits: 7  },

  // --- W ---
  { code: "+681", dial: "681", country: "Wallis and Futuna",      flag: "WF", emoji: toFlagEmoji("WF"), maxDigits: 6  },

  // --- Y ---
  { code: "+967", dial: "967", country: "Yemen",                  flag: "YE", emoji: toFlagEmoji("YE"), maxDigits: 9  },

  // --- Z ---
  { code: "+260", dial: "260", country: "Zambia",                 flag: "ZM", emoji: toFlagEmoji("ZM"), maxDigits: 9  },
  { code: "+263", dial: "263", country: "Zimbabwe",               flag: "ZW", emoji: toFlagEmoji("ZW"), maxDigits: 10 },
];

/** Default country code — determined by config */
export const DEFAULT_COUNTRY_CODE = COUNTRY_CODES.find(
  (c) => c.code === APP_CONFIG.phone.defaultCountryCode
) || COUNTRY_CODES[0];

/**
 * Build a full international phone string from country code + local number.
 * Example: buildFullPhone("+62", "8123456789") -> "+628123456789"
 */
export function buildFullPhone(countryCode: string, localPhone: string): string {
  // Strip all non-digits from local phone
  let digits = localPhone.replace(/\D/g, "");
  // If local phone starts with 0, remove it (common in Indonesia, India, etc.)
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return `${countryCode}${digits}`;
}

/**
 * Parse a full international phone into { countryCode, localPhone }.
 * Tries to match the longest country code first.
 * Falls back to +62 for legacy numbers without a country code prefix.
 */
export function parseFullPhone(fullPhone: string): { countryCode: string; localPhone: string } {
  if (!fullPhone) return { countryCode: "+62", localPhone: "" };

  let phone = fullPhone.trim();

  // If starts with +, try to match a country code
  if (phone.startsWith("+")) {
    // Sort by code length descending so we match longer codes first (e.g., +971 before +9)
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const cc of sorted) {
      if (phone.startsWith(cc.code)) {
        return { countryCode: cc.code, localPhone: phone.slice(cc.code.length) };
      }
    }
    // Unknown country code - return as-is with best-guess split
    const match = phone.match(/^(\+\d{1,4})(.*)/);
    if (match) {
      return { countryCode: match[1], localPhone: match[2] };
    }
  }

  // Legacy number without country code - assume configured default
  return { countryCode: APP_CONFIG.phone.defaultCountryCode, localPhone: phone };
}

/**
 * Find a CountryCode entry by its code string (e.g., "+62").
 */
export function findCountryByCode(code: string): CountryCode | undefined {
  return COUNTRY_CODES.find((cc) => cc.code === code);
}