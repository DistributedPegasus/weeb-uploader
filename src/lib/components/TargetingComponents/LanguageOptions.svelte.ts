export interface Language {
	id: string;
	name: string;
}

// Map ISO language codes to ISO country codes for flag emojis
function getCountryCodeForLanguage(langId: string): string {
	const langToCountry: Record<string, string> = {
		en: 'gb',
		af: 'za',
		sq: 'al',
		ar: 'sa',
		az: 'az',
		eu: 'es',
		be: 'by',
		bn: 'bd',
		bg: 'bg',
		my: 'mm',
		ca: 'es',
		zh: 'cn',
		'zh-hk': 'hk',
		cv: 'ru',
		hr: 'hr',
		cs: 'cz',
		da: 'dk',
		nl: 'nl',
		eo: 'eo', // Esperanto - use UN flag or special handling
		et: 'ee',
		tl: 'ph',
		fi: 'fi',
		fr: 'fr',
		ka: 'ge',
		de: 'de',
		el: 'gr',
		he: 'il',
		hi: 'in',
		hu: 'hu',
		id: 'id',
		jv: 'id',
		ga: 'ie',
		it: 'it',
		ja: 'jp',
		kk: 'kz',
		ko: 'kr',
		la: 'va', // Latin - use Vatican flag
		lt: 'lt',
		ms: 'my',
		mn: 'mn',
		ne: 'np',
		no: 'no',
		fa: 'ir',
		pl: 'pl',
		pt: 'pt',
		'pt-br': 'br',
		ro: 'ro',
		ru: 'ru',
		sr: 'rs',
		sk: 'sk',
		sl: 'si',
		es: 'es',
		'es-la': 'mx',
		sv: 'se',
		tam: 'in',
		te: 'in',
		th: 'th',
		tr: 'tr',
		uk: 'ua',
		ur: 'pk',
		uz: 'uz',
		vi: 'vn'
	};

	return langToCountry[langId] || langId;
}

// Convert country code to flag emoji
function getFlagEmoji(countryCode: string): string {
	// Special cases
	if (countryCode === 'eo') {
		// Esperanto - use 🌐 (globe) or 🏳️ (white flag)
		return '🌐';
	}

	// Convert country code to flag emoji
	// Each flag emoji is made of two regional indicator symbols
	const codePoints = countryCode
		.toUpperCase()
		.split('')
		.map((char) => 127397 + char.charCodeAt(0));
	return String.fromCodePoint(...codePoints);
}

export function getLanguageFlag(langId: string): string {
	const countryCode = getCountryCodeForLanguage(langId);
	return getFlagEmoji(countryCode);
}

export function getLanguageDisplayText(language: Language): string {
	return `${getLanguageFlag(language.id)} ${language.name}`;
}

export const languages: Language[] = [
	{
		id: 'en',
		name: 'English'
	},
	{
		id: 'af',
		name: 'Afrikaans'
	},
	{
		id: 'sq',
		name: 'Albanian'
	},
	{
		id: 'ar',
		name: 'Arabic'
	},
	{
		id: 'az',
		name: 'Azerbaijani'
	},
	{
		id: 'eu',
		name: 'Basque'
	},
	{
		id: 'be',
		name: 'Belarusian'
	},
	{
		id: 'bn',
		name: 'Bengali'
	},
	{
		id: 'bg',
		name: 'Bulgarian'
	},
	{
		id: 'my',
		name: 'Burmese'
	},
	{
		id: 'ca',
		name: 'Catalan'
	},
	{
		id: 'zh',
		name: 'Chinese (Simplified)'
	},
	{
		id: 'zh-hk',
		name: 'Chinese (Traditional)'
	},
	{
		id: 'cv',
		name: 'Chuvash'
	},
	{
		id: 'hr',
		name: 'Croatian'
	},
	{
		id: 'cs',
		name: 'Czech'
	},
	{
		id: 'da',
		name: 'Danish'
	},
	{
		id: 'nl',
		name: 'Dutch'
	},
	{
		id: 'eo',
		name: 'Esperanto'
	},
	{
		id: 'et',
		name: 'Estonian'
	},
	{
		id: 'tl',
		name: 'Filipino'
	},
	{
		id: 'fi',
		name: 'Finish'
	},
	{
		id: 'fr',
		name: 'French'
	},
	{
		id: 'ka',
		name: 'Georgian'
	},
	{
		id: 'de',
		name: 'German'
	},
	{
		id: 'el',
		name: 'Greek'
	},
	{
		id: 'he',
		name: 'Hebrew'
	},
	{
		id: 'hi',
		name: 'Hindi'
	},
	{
		id: 'hu',
		name: 'Hungarian'
	},
	{
		id: 'id',
		name: 'Indonesian'
	},
	{
		id: 'jv',
		name: 'Javanese'
	},
	{
		id: 'ga',
		name: 'Irish'
	},
	{
		id: 'it',
		name: 'Italian'
	},
	{
		id: 'ja',
		name: 'Japanese'
	},
	{
		id: 'kk',
		name: 'Kazakh'
	},
	{
		id: 'ko',
		name: 'Korean'
	},
	{
		id: 'la',
		name: 'Latin'
	},
	{
		id: 'lt',
		name: 'Lithuanian'
	},
	{
		id: 'ms',
		name: 'Malay'
	},
	{
		id: 'mn',
		name: 'Mongolian'
	},
	{
		id: 'ne',
		name: 'Nepali'
	},
	{
		id: 'no',
		name: 'Norwegian'
	},
	{
		id: 'fa',
		name: 'Persian'
	},
	{
		id: 'pl',
		name: 'Polish'
	},
	{
		id: 'pt',
		name: 'Portuguese'
	},
	{
		id: 'pt-br',
		name: 'Portuguese (Brazil)'
	},
	{
		id: 'ro',
		name: 'Romanian'
	},
	{
		id: 'ru',
		name: 'Russian'
	},
	{
		id: 'sr',
		name: 'Serbian'
	},
	{
		id: 'sk',
		name: 'Slovak'
	},
	{
		id: 'sl',
		name: 'Slovenian'
	},
	{
		id: 'es',
		name: 'Spanish'
	},
	{
		id: 'es-la',
		name: 'Spanish (LATAM)'
	},
	{
		id: 'sv',
		name: 'Swedish'
	},
	{
		id: 'tam',
		name: 'Tamil'
	},
	{
		id: 'te',
		name: 'Telugu'
	},
	{
		id: 'th',
		name: 'Thai'
	},
	{
		id: 'tr',
		name: 'Turkish'
	},
	{
		id: 'uk',
		name: 'Ukranian'
	},
	{
		id: 'ur',
		name: 'Urdu'
	},
	{
		id: 'uz',
		name: 'Uzbek'
	},
	{
		id: 'vi',
		name: 'Vietnamese'
	}
];
