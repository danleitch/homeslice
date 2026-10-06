/**
 * Finding a time zone by the place you mean. A time zone is named for one big city in it
 * (America/New_York), so Boston, Atlanta and Miami are not in the list a browser knows. This is a
 * list of the places people look for, each with the zone it keeps time by, and the search over it
 * for the World clock's settings. It works offline, with no service to ask.
 */
export type Place = {
  /** What to call it on the clock, e.g. "Boston". */
  name: string;
  /** Where it is, e.g. "Massachusetts, United States". */
  region: string;
  /** The IANA zone it keeps time by, e.g. "America/New_York". */
  zone: string;
};

/** A place, its region, its zone, and other words someone might look for it by. */
type Row = readonly [name: string, region: string, zone: string, aliases?: string];

const country = (
  region: string,
  rows: ReadonlyArray<readonly [name: string, zone: string, aliases?: string]>
): Row[] => rows.map(([name, zone, aliases]) => [name, region, zone, aliases]);

const states = (
  rows: ReadonlyArray<readonly [name: string, state: string, zone: string, aliases?: string]>
): Row[] =>
  rows.map(([name, state, zone, aliases]) => [name, `${state}, United States`, zone, aliases]);

/** Words for a country that people use instead of its name. */
const COUNTRY_WORDS: Readonly<Record<string, string>> = {
  'United States': 'usa us america',
  'United Kingdom': 'uk britain great britain england',
  'United Arab Emirates': 'uae emirates',
  'South Korea': 'korea',
  Czechia: 'czech republic',
  Netherlands: 'holland',
  Myanmar: 'burma',
  'Ivory Coast': 'cote d ivoire',
  'Democratic Republic of the Congo': 'drc congo',
  'Saudi Arabia': 'ksa',
  'New Zealand': 'nz aotearoa'
};

/** Most-looked-for first: it is the order results come in when two match equally well. */
const ROWS: readonly Row[] = [
  ['UTC', 'Coordinated Universal Time', 'UTC', 'gmt zulu utc z'],
  ...states([
    ['New York', 'New York', 'America/New_York', 'nyc new york city eastern time est edt et'],
    ['Los Angeles', 'California', 'America/Los_Angeles', 'la pacific time pst pdt pt'],
    ['Chicago', 'Illinois', 'America/Chicago', 'central time cst cdt ct'],
    ['San Francisco', 'California', 'America/Los_Angeles', 'sf bay area silicon valley'],
    ['Boston', 'Massachusetts', 'America/New_York', 'eastern time'],
    ['Washington', 'District of Columbia', 'America/New_York', 'dc washington dc'],
    ['Seattle', 'Washington', 'America/Los_Angeles'],
    ['Miami', 'Florida', 'America/New_York'],
    ['Denver', 'Colorado', 'America/Denver', 'mountain time mst mdt mt'],
    ['Atlanta', 'Georgia', 'America/New_York'],
    ['Dallas', 'Texas', 'America/Chicago'],
    ['Houston', 'Texas', 'America/Chicago'],
    ['Austin', 'Texas', 'America/Chicago'],
    ['San Antonio', 'Texas', 'America/Chicago'],
    ['Philadelphia', 'Pennsylvania', 'America/New_York', 'philly'],
    ['Pittsburgh', 'Pennsylvania', 'America/New_York'],
    ['Phoenix', 'Arizona', 'America/Phoenix', 'arizona mst'],
    ['Tucson', 'Arizona', 'America/Phoenix', 'arizona mst'],
    ['San Diego', 'California', 'America/Los_Angeles'],
    ['San Jose', 'California', 'America/Los_Angeles', 'silicon valley'],
    ['Sacramento', 'California', 'America/Los_Angeles'],
    ['Las Vegas', 'Nevada', 'America/Los_Angeles', 'vegas'],
    ['Portland', 'Oregon', 'America/Los_Angeles'],
    ['Salt Lake City', 'Utah', 'America/Denver', 'slc'],
    ['Albuquerque', 'New Mexico', 'America/Denver'],
    ['El Paso', 'Texas', 'America/Denver'],
    ['Boise', 'Idaho', 'America/Boise'],
    ['Minneapolis', 'Minnesota', 'America/Chicago', 'twin cities'],
    ['St. Louis', 'Missouri', 'America/Chicago', 'saint louis'],
    ['Kansas City', 'Missouri', 'America/Chicago'],
    ['Milwaukee', 'Wisconsin', 'America/Chicago'],
    ['New Orleans', 'Louisiana', 'America/Chicago', 'nola'],
    ['Nashville', 'Tennessee', 'America/Chicago'],
    ['Memphis', 'Tennessee', 'America/Chicago'],
    ['Oklahoma City', 'Oklahoma', 'America/Chicago', 'okc'],
    ['Omaha', 'Nebraska', 'America/Chicago'],
    ['Des Moines', 'Iowa', 'America/Chicago'],
    ['Birmingham', 'Alabama', 'America/Chicago'],
    ['Detroit', 'Michigan', 'America/Detroit'],
    ['Cleveland', 'Ohio', 'America/New_York'],
    ['Columbus', 'Ohio', 'America/New_York'],
    ['Cincinnati', 'Ohio', 'America/New_York'],
    ['Indianapolis', 'Indiana', 'America/Indiana/Indianapolis'],
    ['Louisville', 'Kentucky', 'America/Kentucky/Louisville'],
    ['Baltimore', 'Maryland', 'America/New_York'],
    ['Charlotte', 'North Carolina', 'America/New_York'],
    ['Raleigh', 'North Carolina', 'America/New_York'],
    ['Richmond', 'Virginia', 'America/New_York'],
    ['Orlando', 'Florida', 'America/New_York'],
    ['Tampa', 'Florida', 'America/New_York'],
    ['Buffalo', 'New York', 'America/New_York'],
    ['Hartford', 'Connecticut', 'America/New_York'],
    ['Providence', 'Rhode Island', 'America/New_York'],
    ['Newark', 'New Jersey', 'America/New_York'],
    ['Anchorage', 'Alaska', 'America/Anchorage', 'alaska akst akdt'],
    ['Honolulu', 'Hawaii', 'Pacific/Honolulu', 'hawaii hst']
  ]),
  ...country('Canada', [
    ['Toronto', 'America/Toronto'],
    ['Vancouver', 'America/Vancouver', 'british columbia'],
    ['Montréal', 'America/Toronto', 'quebec'],
    ['Ottawa', 'America/Toronto', 'ontario'],
    ['Calgary', 'America/Edmonton', 'alberta'],
    ['Edmonton', 'America/Edmonton', 'alberta'],
    ['Winnipeg', 'America/Winnipeg', 'manitoba'],
    ['Québec City', 'America/Toronto', 'quebec'],
    ['Victoria', 'America/Vancouver', 'british columbia'],
    ['Halifax', 'America/Halifax', 'nova scotia atlantic time'],
    ['Regina', 'America/Regina', 'saskatchewan'],
    ['Saskatoon', 'America/Regina', 'saskatchewan'],
    ["St. John's", 'America/St_Johns', 'newfoundland']
  ]),
  ...country('United Kingdom', [
    ['London', 'Europe/London', 'gmt bst'],
    ['Manchester', 'Europe/London'],
    ['Birmingham', 'Europe/London'],
    ['Edinburgh', 'Europe/London', 'scotland'],
    ['Glasgow', 'Europe/London', 'scotland'],
    ['Liverpool', 'Europe/London'],
    ['Leeds', 'Europe/London'],
    ['Bristol', 'Europe/London'],
    ['Cardiff', 'Europe/London', 'wales'],
    ['Belfast', 'Europe/London', 'northern ireland']
  ]),
  ...country('Ireland', [['Dublin', 'Europe/Dublin']]),
  ...country('France', [
    ['Paris', 'Europe/Paris', 'cet cest'],
    ['Lyon', 'Europe/Paris'],
    ['Marseille', 'Europe/Paris'],
    ['Nice', 'Europe/Paris'],
    ['Toulouse', 'Europe/Paris']
  ]),
  ...country('Germany', [
    ['Berlin', 'Europe/Berlin', 'cet cest'],
    ['Munich', 'Europe/Berlin', 'münchen'],
    ['Frankfurt', 'Europe/Berlin'],
    ['Hamburg', 'Europe/Berlin'],
    ['Cologne', 'Europe/Berlin', 'köln'],
    ['Stuttgart', 'Europe/Berlin'],
    ['Düsseldorf', 'Europe/Berlin']
  ]),
  ...country('Spain', [
    ['Madrid', 'Europe/Madrid'],
    ['Barcelona', 'Europe/Madrid'],
    ['Valencia', 'Europe/Madrid'],
    ['Seville', 'Europe/Madrid', 'sevilla'],
    ['Las Palmas', 'Atlantic/Canary', 'canary islands']
  ]),
  ...country('Italy', [
    ['Rome', 'Europe/Rome', 'roma'],
    ['Milan', 'Europe/Rome', 'milano'],
    ['Naples', 'Europe/Rome', 'napoli'],
    ['Turin', 'Europe/Rome', 'torino'],
    ['Florence', 'Europe/Rome', 'firenze'],
    ['Venice', 'Europe/Rome', 'venezia'],
    ['Bologna', 'Europe/Rome'],
    ['Palermo', 'Europe/Rome']
  ]),
  ...country('Portugal', [
    ['Lisbon', 'Europe/Lisbon', 'lisboa'],
    ['Porto', 'Europe/Lisbon'],
    ['Ponta Delgada', 'Atlantic/Azores', 'azores']
  ]),
  ...country('Netherlands', [
    ['Amsterdam', 'Europe/Amsterdam'],
    ['Rotterdam', 'Europe/Amsterdam'],
    ['The Hague', 'Europe/Amsterdam', 'den haag']
  ]),
  ...country('Belgium', [['Brussels', 'Europe/Brussels', 'bruxelles']]),
  ...country('Luxembourg', [['Luxembourg', 'Europe/Luxembourg']]),
  ...country('Switzerland', [
    ['Zürich', 'Europe/Zurich', 'zurich'],
    ['Geneva', 'Europe/Zurich', 'genève'],
    ['Bern', 'Europe/Zurich']
  ]),
  ...country('Austria', [['Vienna', 'Europe/Vienna', 'wien']]),
  ...country('Czechia', [['Prague', 'Europe/Prague', 'praha']]),
  ...country('Slovakia', [['Bratislava', 'Europe/Bratislava']]),
  ...country('Poland', [
    ['Warsaw', 'Europe/Warsaw', 'warszawa'],
    ['Kraków', 'Europe/Warsaw', 'krakow cracow'],
    ['Gdańsk', 'Europe/Warsaw', 'gdansk']
  ]),
  ...country('Hungary', [['Budapest', 'Europe/Budapest']]),
  ...country('Romania', [['Bucharest', 'Europe/Bucharest', 'bucurești']]),
  ...country('Bulgaria', [['Sofia', 'Europe/Sofia']]),
  ...country('Greece', [
    ['Athens', 'Europe/Athens'],
    ['Thessaloniki', 'Europe/Athens']
  ]),
  ...country('Serbia', [['Belgrade', 'Europe/Belgrade', 'beograd']]),
  ...country('Croatia', [['Zagreb', 'Europe/Zagreb']]),
  ...country('Slovenia', [['Ljubljana', 'Europe/Ljubljana']]),
  ...country('Bosnia and Herzegovina', [['Sarajevo', 'Europe/Sarajevo']]),
  ...country('North Macedonia', [['Skopje', 'Europe/Skopje']]),
  ...country('Montenegro', [['Podgorica', 'Europe/Podgorica']]),
  ...country('Albania', [['Tirana', 'Europe/Tirane', 'tirane']]),
  ...country('Malta', [['Valletta', 'Europe/Malta', 'malta']]),
  ...country('Monaco', [['Monaco', 'Europe/Monaco']]),
  ...country('Andorra', [['Andorra la Vella', 'Europe/Andorra', 'andorra']]),
  ...country('Vatican City', [['Vatican City', 'Europe/Vatican', 'holy see']]),
  ...country('Gibraltar', [['Gibraltar', 'Europe/Gibraltar']]),
  ...country('Denmark', [['Copenhagen', 'Europe/Copenhagen', 'københavn']]),
  ...country('Sweden', [
    ['Stockholm', 'Europe/Stockholm'],
    ['Gothenburg', 'Europe/Stockholm', 'göteborg']
  ]),
  ...country('Norway', [
    ['Oslo', 'Europe/Oslo'],
    ['Bergen', 'Europe/Oslo']
  ]),
  ...country('Finland', [['Helsinki', 'Europe/Helsinki']]),
  ...country('Iceland', [['Reykjavík', 'Atlantic/Reykjavik', 'reykjavik']]),
  ...country('Estonia', [['Tallinn', 'Europe/Tallinn']]),
  ...country('Latvia', [['Riga', 'Europe/Riga']]),
  ...country('Lithuania', [['Vilnius', 'Europe/Vilnius']]),
  ...country('Ukraine', [['Kyiv', 'Europe/Kyiv', 'kiev']]),
  ...country('Belarus', [['Minsk', 'Europe/Minsk']]),
  ...country('Moldova', [['Chișinău', 'Europe/Chisinau', 'chisinau']]),
  ...country('Russia', [
    ['Moscow', 'Europe/Moscow', 'msk'],
    ['St. Petersburg', 'Europe/Moscow', 'saint petersburg leningrad'],
    ['Kaliningrad', 'Europe/Kaliningrad'],
    ['Samara', 'Europe/Samara'],
    ['Yekaterinburg', 'Asia/Yekaterinburg', 'ekaterinburg'],
    ['Omsk', 'Asia/Omsk'],
    ['Novosibirsk', 'Asia/Novosibirsk'],
    ['Krasnoyarsk', 'Asia/Krasnoyarsk'],
    ['Irkutsk', 'Asia/Irkutsk'],
    ['Yakutsk', 'Asia/Yakutsk'],
    ['Vladivostok', 'Asia/Vladivostok'],
    ['Magadan', 'Asia/Magadan'],
    ['Petropavlovsk-Kamchatsky', 'Asia/Kamchatka', 'kamchatka']
  ]),
  ...country('Türkiye', [
    ['Istanbul', 'Europe/Istanbul', 'turkey'],
    ['Ankara', 'Europe/Istanbul', 'turkey']
  ]),
  ...country('Cyprus', [['Nicosia', 'Asia/Nicosia']]),
  ...country('Israel', [
    ['Jerusalem', 'Asia/Jerusalem', 'ist'],
    ['Tel Aviv', 'Asia/Jerusalem', 'ist']
  ]),
  ...country('Lebanon', [['Beirut', 'Asia/Beirut']]),
  ...country('Jordan', [['Amman', 'Asia/Amman']]),
  ...country('Syria', [['Damascus', 'Asia/Damascus']]),
  ...country('Iraq', [['Baghdad', 'Asia/Baghdad']]),
  ...country('Iran', [['Tehran', 'Asia/Tehran']]),
  ...country('Saudi Arabia', [
    ['Riyadh', 'Asia/Riyadh'],
    ['Jeddah', 'Asia/Riyadh'],
    ['Mecca', 'Asia/Riyadh', 'makkah'],
    ['Medina', 'Asia/Riyadh', 'madinah']
  ]),
  ...country('United Arab Emirates', [
    ['Dubai', 'Asia/Dubai'],
    ['Abu Dhabi', 'Asia/Dubai']
  ]),
  ...country('Qatar', [['Doha', 'Asia/Qatar']]),
  ...country('Kuwait', [['Kuwait City', 'Asia/Kuwait']]),
  ...country('Bahrain', [['Manama', 'Asia/Bahrain']]),
  ...country('Oman', [['Muscat', 'Asia/Muscat']]),
  ...country('Yemen', [["Sana'a", 'Asia/Aden', 'sanaa']]),
  ...country('Azerbaijan', [['Baku', 'Asia/Baku']]),
  ...country('Georgia', [['Tbilisi', 'Asia/Tbilisi']]),
  ...country('Armenia', [['Yerevan', 'Asia/Yerevan']]),
  ...country('India', [
    ['Delhi', 'Asia/Kolkata', 'new delhi ist indian standard time'],
    ['Mumbai', 'Asia/Kolkata', 'bombay ist'],
    ['Bengaluru', 'Asia/Kolkata', 'bangalore ist'],
    ['Chennai', 'Asia/Kolkata', 'madras ist'],
    ['Kolkata', 'Asia/Kolkata', 'calcutta ist'],
    ['Hyderabad', 'Asia/Kolkata', 'ist'],
    ['Pune', 'Asia/Kolkata', 'ist'],
    ['Ahmedabad', 'Asia/Kolkata', 'ist'],
    ['Jaipur', 'Asia/Kolkata', 'ist']
  ]),
  ...country('Pakistan', [
    ['Karachi', 'Asia/Karachi'],
    ['Lahore', 'Asia/Karachi'],
    ['Islamabad', 'Asia/Karachi']
  ]),
  ...country('Bangladesh', [['Dhaka', 'Asia/Dhaka', 'dacca']]),
  ...country('Sri Lanka', [['Colombo', 'Asia/Colombo']]),
  ...country('Nepal', [['Kathmandu', 'Asia/Kathmandu']]),
  ...country('Bhutan', [['Thimphu', 'Asia/Thimphu']]),
  ...country('Maldives', [['Malé', 'Indian/Maldives', 'male']]),
  ...country('Afghanistan', [['Kabul', 'Asia/Kabul']]),
  ...country('Uzbekistan', [['Tashkent', 'Asia/Tashkent']]),
  ...country('Kazakhstan', [
    ['Almaty', 'Asia/Almaty'],
    ['Astana', 'Asia/Almaty']
  ]),
  ...country('Kyrgyzstan', [['Bishkek', 'Asia/Bishkek']]),
  ...country('Tajikistan', [['Dushanbe', 'Asia/Dushanbe']]),
  ...country('Turkmenistan', [['Ashgabat', 'Asia/Ashgabat']]),
  ...country('Thailand', [
    ['Bangkok', 'Asia/Bangkok'],
    ['Chiang Mai', 'Asia/Bangkok'],
    ['Phuket', 'Asia/Bangkok']
  ]),
  ...country('Vietnam', [
    ['Ho Chi Minh City', 'Asia/Ho_Chi_Minh', 'saigon'],
    ['Hanoi', 'Asia/Ho_Chi_Minh', 'hà nội']
  ]),
  ...country('Cambodia', [['Phnom Penh', 'Asia/Phnom_Penh']]),
  ...country('Laos', [['Vientiane', 'Asia/Vientiane']]),
  ...country('Myanmar', [['Yangon', 'Asia/Yangon', 'rangoon']]),
  ...country('Malaysia', [['Kuala Lumpur', 'Asia/Kuala_Lumpur', 'kl']]),
  ...country('Singapore', [['Singapore', 'Asia/Singapore', 'sgt']]),
  ...country('Indonesia', [
    ['Jakarta', 'Asia/Jakarta'],
    ['Surabaya', 'Asia/Jakarta'],
    ['Bali', 'Asia/Makassar', 'denpasar']
  ]),
  ...country('Brunei', [['Bandar Seri Begawan', 'Asia/Brunei', 'brunei']]),
  ...country('Timor-Leste', [['Dili', 'Asia/Dili', 'east timor']]),
  ...country('Philippines', [
    ['Manila', 'Asia/Manila'],
    ['Cebu', 'Asia/Manila']
  ]),
  ...country('Hong Kong', [['Hong Kong', 'Asia/Hong_Kong', 'hkt']]),
  ...country('Macau', [['Macau', 'Asia/Macau', 'macao']]),
  ...country('Taiwan', [['Taipei', 'Asia/Taipei']]),
  ...country('China', [
    ['Beijing', 'Asia/Shanghai', 'china standard time cst'],
    ['Shanghai', 'Asia/Shanghai', 'cst'],
    ['Shenzhen', 'Asia/Shanghai', 'cst'],
    ['Guangzhou', 'Asia/Shanghai', 'canton cst'],
    ['Chengdu', 'Asia/Shanghai', 'cst'],
    ['Wuhan', 'Asia/Shanghai', 'cst'],
    ["Xi'an", 'Asia/Shanghai', 'xian cst'],
    ['Chongqing', 'Asia/Shanghai', 'cst'],
    ['Tianjin', 'Asia/Shanghai', 'cst'],
    ['Hangzhou', 'Asia/Shanghai', 'cst'],
    ['Nanjing', 'Asia/Shanghai', 'cst']
  ]),
  ...country('Mongolia', [['Ulaanbaatar', 'Asia/Ulaanbaatar', 'ulan bator']]),
  ...country('South Korea', [
    ['Seoul', 'Asia/Seoul', 'kst'],
    ['Busan', 'Asia/Seoul', 'pusan'],
    ['Incheon', 'Asia/Seoul']
  ]),
  ...country('North Korea', [['Pyongyang', 'Asia/Pyongyang']]),
  ...country('Japan', [
    ['Tokyo', 'Asia/Tokyo', 'jst'],
    ['Osaka', 'Asia/Tokyo', 'jst'],
    ['Kyoto', 'Asia/Tokyo', 'jst'],
    ['Yokohama', 'Asia/Tokyo', 'jst'],
    ['Nagoya', 'Asia/Tokyo', 'jst'],
    ['Sapporo', 'Asia/Tokyo', 'jst'],
    ['Fukuoka', 'Asia/Tokyo', 'jst'],
    ['Hiroshima', 'Asia/Tokyo', 'jst'],
    ['Naha', 'Asia/Tokyo', 'okinawa jst']
  ]),
  ...country('Australia', [
    ['Sydney', 'Australia/Sydney', 'new south wales aest aedt'],
    ['Melbourne', 'Australia/Melbourne', 'victoria aest aedt'],
    ['Brisbane', 'Australia/Brisbane', 'queensland aest'],
    ['Perth', 'Australia/Perth', 'western australia awst'],
    ['Adelaide', 'Australia/Adelaide', 'south australia acst acdt'],
    ['Canberra', 'Australia/Sydney', 'act aest aedt'],
    ['Gold Coast', 'Australia/Brisbane', 'queensland aest'],
    ['Darwin', 'Australia/Darwin', 'northern territory acst'],
    ['Hobart', 'Australia/Hobart', 'tasmania aest aedt']
  ]),
  ...country('New Zealand', [
    ['Auckland', 'Pacific/Auckland', 'nzst nzdt'],
    ['Wellington', 'Pacific/Auckland', 'nzst nzdt'],
    ['Christchurch', 'Pacific/Auckland', 'nzst nzdt'],
    ['Queenstown', 'Pacific/Auckland', 'nzst nzdt']
  ]),
  ...country('Fiji', [['Suva', 'Pacific/Fiji']]),
  ...country('Papua New Guinea', [['Port Moresby', 'Pacific/Port_Moresby']]),
  ...country('New Caledonia', [['Nouméa', 'Pacific/Noumea', 'noumea']]),
  ...country('French Polynesia', [['Papeete', 'Pacific/Tahiti', 'tahiti']]),
  ...country('Guam', [['Hagåtña', 'Pacific/Guam', 'guam agana']]),
  ...country('Samoa', [['Apia', 'Pacific/Apia']]),
  ...country('American Samoa', [['Pago Pago', 'Pacific/Pago_Pago']]),
  ...country('Tonga', [['Nukuʻalofa', 'Pacific/Tongatapu', 'nukualofa']]),
  ...country('Vanuatu', [['Port Vila', 'Pacific/Efate']]),
  ...country('Solomon Islands', [['Honiara', 'Pacific/Guadalcanal']]),
  ...country('Kiribati', [['Tarawa', 'Pacific/Tarawa']]),
  ...country('Marshall Islands', [['Majuro', 'Pacific/Majuro']]),
  ...country('Palau', [['Koror', 'Pacific/Palau']]),
  ...country('Mexico', [
    ['Mexico City', 'America/Mexico_City', 'cdmx ciudad de mexico'],
    ['Guadalajara', 'America/Mexico_City'],
    ['Monterrey', 'America/Monterrey'],
    ['Tijuana', 'America/Tijuana'],
    ['Cancún', 'America/Cancun', 'cancun']
  ]),
  ...country('Puerto Rico', [['San Juan', 'America/Puerto_Rico']]),
  ...country('Guatemala', [['Guatemala City', 'America/Guatemala']]),
  ...country('El Salvador', [['San Salvador', 'America/El_Salvador']]),
  ...country('Honduras', [['Tegucigalpa', 'America/Tegucigalpa']]),
  ...country('Nicaragua', [['Managua', 'America/Managua']]),
  ...country('Costa Rica', [['San José', 'America/Costa_Rica', 'san jose']]),
  ...country('Panama', [['Panama City', 'America/Panama']]),
  ...country('Cuba', [['Havana', 'America/Havana', 'la habana']]),
  ...country('Jamaica', [['Kingston', 'America/Jamaica']]),
  ...country('Dominican Republic', [['Santo Domingo', 'America/Santo_Domingo']]),
  ...country('Haiti', [['Port-au-Prince', 'America/Port-au-Prince']]),
  ...country('The Bahamas', [['Nassau', 'America/Nassau', 'bahamas']]),
  ...country('Barbados', [['Bridgetown', 'America/Barbados']]),
  ...country('Trinidad and Tobago', [['Port of Spain', 'America/Port_of_Spain', 'trinidad']]),
  ...country('Colombia', [
    ['Bogotá', 'America/Bogota', 'bogota'],
    ['Medellín', 'America/Bogota', 'medellin']
  ]),
  ...country('Peru', [['Lima', 'America/Lima']]),
  ...country('Ecuador', [['Quito', 'America/Guayaquil']]),
  ...country('Venezuela', [['Caracas', 'America/Caracas']]),
  ...country('Guyana', [['Georgetown', 'America/Guyana']]),
  ...country('Suriname', [['Paramaribo', 'America/Paramaribo']]),
  ...country('Bolivia', [['La Paz', 'America/La_Paz']]),
  ...country('Chile', [['Santiago', 'America/Santiago']]),
  ...country('Argentina', [['Buenos Aires', 'America/Argentina/Buenos_Aires']]),
  ...country('Uruguay', [['Montevideo', 'America/Montevideo']]),
  ...country('Paraguay', [['Asunción', 'America/Asuncion', 'asuncion']]),
  ...country('Brazil', [
    ['São Paulo', 'America/Sao_Paulo', 'sao paulo brt'],
    ['Rio de Janeiro', 'America/Sao_Paulo', 'rio brt'],
    ['Brasília', 'America/Sao_Paulo', 'brasilia brt'],
    ['Belo Horizonte', 'America/Sao_Paulo', 'brt'],
    ['Porto Alegre', 'America/Sao_Paulo', 'brt'],
    ['Curitiba', 'America/Sao_Paulo', 'brt'],
    ['Salvador', 'America/Bahia', 'bahia'],
    ['Fortaleza', 'America/Fortaleza'],
    ['Recife', 'America/Recife'],
    ['Manaus', 'America/Manaus', 'amazon'],
    ['Belém', 'America/Belem', 'belem']
  ]),
  ...country('Egypt', [
    ['Cairo', 'Africa/Cairo'],
    ['Alexandria', 'Africa/Cairo']
  ]),
  ...country('Libya', [['Tripoli', 'Africa/Tripoli']]),
  ...country('Tunisia', [['Tunis', 'Africa/Tunis']]),
  ...country('Algeria', [['Algiers', 'Africa/Algiers']]),
  ...country('Morocco', [
    ['Casablanca', 'Africa/Casablanca'],
    ['Rabat', 'Africa/Casablanca'],
    ['Marrakesh', 'Africa/Casablanca', 'marrakech']
  ]),
  ...country('Nigeria', [
    ['Lagos', 'Africa/Lagos', 'wat'],
    ['Abuja', 'Africa/Lagos', 'wat']
  ]),
  ...country('Ghana', [['Accra', 'Africa/Accra']]),
  ...country('Ivory Coast', [['Abidjan', 'Africa/Abidjan']]),
  ...country('Senegal', [['Dakar', 'Africa/Dakar']]),
  ...country('Mali', [['Bamako', 'Africa/Bamako']]),
  ...country('Guinea', [['Conakry', 'Africa/Conakry']]),
  ...country('Sierra Leone', [['Freetown', 'Africa/Freetown']]),
  ...country('Liberia', [['Monrovia', 'Africa/Monrovia']]),
  ...country('Burkina Faso', [['Ouagadougou', 'Africa/Ouagadougou']]),
  ...country('Niger', [['Niamey', 'Africa/Niamey']]),
  ...country('Chad', [["N'Djamena", 'Africa/Ndjamena', 'ndjamena']]),
  ...country('Cameroon', [
    ['Douala', 'Africa/Douala'],
    ['Yaoundé', 'Africa/Douala', 'yaounde']
  ]),
  ...country('Gabon', [['Libreville', 'Africa/Libreville']]),
  ...country('Democratic Republic of the Congo', [
    ['Kinshasa', 'Africa/Kinshasa'],
    ['Lubumbashi', 'Africa/Lubumbashi']
  ]),
  ...country('Republic of the Congo', [['Brazzaville', 'Africa/Brazzaville']]),
  ...country('Angola', [['Luanda', 'Africa/Luanda']]),
  ...country('Kenya', [
    ['Nairobi', 'Africa/Nairobi', 'eat'],
    ['Mombasa', 'Africa/Nairobi', 'eat']
  ]),
  ...country('Ethiopia', [['Addis Ababa', 'Africa/Addis_Ababa', 'eat']]),
  ...country('Somalia', [['Mogadishu', 'Africa/Mogadishu']]),
  ...country('Djibouti', [['Djibouti', 'Africa/Djibouti']]),
  ...country('Eritrea', [['Asmara', 'Africa/Asmara']]),
  ...country('Sudan', [['Khartoum', 'Africa/Khartoum']]),
  ...country('South Sudan', [['Juba', 'Africa/Juba']]),
  ...country('Uganda', [['Kampala', 'Africa/Kampala']]),
  ...country('Rwanda', [['Kigali', 'Africa/Kigali']]),
  ...country('Burundi', [['Bujumbura', 'Africa/Bujumbura']]),
  ...country('Tanzania', [
    ['Dar es Salaam', 'Africa/Dar_es_Salaam'],
    ['Zanzibar', 'Africa/Dar_es_Salaam']
  ]),
  ...country('Zambia', [['Lusaka', 'Africa/Lusaka']]),
  ...country('Zimbabwe', [['Harare', 'Africa/Harare']]),
  ...country('Mozambique', [['Maputo', 'Africa/Maputo']]),
  ...country('Malawi', [
    ['Lilongwe', 'Africa/Blantyre'],
    ['Blantyre', 'Africa/Blantyre']
  ]),
  ...country('Namibia', [['Windhoek', 'Africa/Windhoek']]),
  ...country('Botswana', [['Gaborone', 'Africa/Gaborone']]),
  ...country('South Africa', [
    ['Johannesburg', 'Africa/Johannesburg', 'sast joburg'],
    ['Cape Town', 'Africa/Johannesburg', 'sast'],
    ['Durban', 'Africa/Johannesburg', 'sast'],
    ['Pretoria', 'Africa/Johannesburg', 'sast']
  ]),
  ...country('Lesotho', [['Maseru', 'Africa/Maseru']]),
  ...country('Eswatini', [['Mbabane', 'Africa/Mbabane', 'swaziland']]),
  ...country('Madagascar', [['Antananarivo', 'Indian/Antananarivo']]),
  ...country('Mauritius', [['Port Louis', 'Indian/Mauritius']]),
  ...country('Seychelles', [['Victoria', 'Indian/Mahe', 'mahe']]),
  ...country('Comoros', [['Moroni', 'Indian/Comoro']]),
  ...country('Cabo Verde', [['Praia', 'Atlantic/Cape_Verde', 'cape verde']])
];

/** Lower case, no accents or punctuation, one space between words. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

type Indexed = {
  place: Place;
  name: string;
  nameWords: string[];
  otherWords: string[];
  zoneWords: string[];
};

const words = (text: string): string[] => fold(text).split(' ').filter(Boolean);

const countryWords = (region: string): string => {
  const country = region.split(', ').pop() ?? region;
  return COUNTRY_WORDS[country] ?? '';
};

const PLACES: readonly Indexed[] = ROWS.map(([name, region, zone, aliases]) => ({
  place: { name, region, zone },
  name: fold(name),
  nameWords: words(name),
  otherWords: words(`${region} ${countryWords(region)} ${aliases ?? ''}`),
  zoneWords: words(zone)
}));

/** The names that count as a place's own, so a label that is one can be replaced by another. */
const PLACE_NAMES: ReadonlySet<string> = new Set(PLACES.map((entry) => entry.name));

/** Whether a label is just a place's name, as opposed to something someone wrote themselves. */
export const isPlaceName = (label: string): boolean => PLACE_NAMES.has(fold(label));

/** The zones the browser knows, for those that are named for a place this list leaves out. */
const knownZones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
      'timeZone'
    );
  } catch {
    return [];
  }
};

let zoneEntries: Indexed[] | null = null;

/** The name an engine calls a zone by, which can differ between engines (Europe/Kyiv, Europe/Kiev). */
const canonical = (zone: string): string => {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
};

/** A place made from a zone's own name, for a zone no place in the list keeps time by. */
const fromZones = (): Indexed[] => {
  if (!zoneEntries) {
    const listed = new Set<string>();

    for (const entry of PLACES) {
      listed.add(entry.place.zone);
      listed.add(canonical(entry.place.zone));
    }

    zoneEntries = knownZones()
      .filter((zone) => zone.includes('/') && !listed.has(zone) && !listed.has(canonical(zone)))
      .map((zone) => {
        const parts = zone.split('/');
        const name = (parts[parts.length - 1] ?? zone).replace(/_/g, ' ');

        return {
          place: { name, region: parts[0].replace(/_/g, ' '), zone },
          name: fold(name),
          nameWords: words(name),
          otherWords: [],
          zoneWords: words(zone)
        };
      });
  }

  return zoneEntries;
};

const starts = (pool: readonly string[], token: string): boolean =>
  pool.some((word) => word.startsWith(token));

/** How well an entry answers a query, lower being better; -1 when it doesn't. */
const score = (entry: Indexed, whole: string, tokens: readonly string[]): number => {
  if (tokens.every((token) => starts(entry.nameWords, token))) {
    return entry.name.startsWith(whole) ? 0 : 1;
  }

  if (tokens.every((token) => starts(entry.nameWords, token) || starts(entry.otherWords, token))) {
    return 2;
  }

  return tokens.every(
    (token) =>
      starts(entry.nameWords, token) ||
      starts(entry.otherWords, token) ||
      starts(entry.zoneWords, token)
  )
    ? 3
    : -1;
};

/**
 * The places a few typed letters could mean, best first: a city or country, a zone's name like
 * "eastern time" or "EST", or an IANA name like "Europe/Paris".
 */
export const findPlaces = (query: string, limit = 8): Place[] => {
  const whole = fold(query);
  const tokens = whole.split(' ').filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  const found: { entry: Indexed; rank: number; order: number }[] = [];

  [...PLACES, ...fromZones()].forEach((entry, order) => {
    const rank = score(entry, whole, tokens);

    if (rank >= 0) {
      found.push({ entry, rank: rank + (order >= PLACES.length ? 1 : 0), order });
    }
  });

  const results: Place[] = [];
  const zonesListed = new Set<string>();

  for (const { entry, rank } of found.sort((a, b) => a.rank - b.rank || a.order - b.order)) {
    // A query that only fits through the zone's name ("Asia/Tokyo", or "syd" for Canberra) matches
    // every place keeping that time; one that is already listed stands for all of them.
    if (rank >= 3 && zonesListed.has(entry.place.zone)) {
      continue;
    }

    zonesListed.add(entry.place.zone);
    results.push(entry.place);

    if (results.length === limit) {
      break;
    }
  }

  return results;
};
