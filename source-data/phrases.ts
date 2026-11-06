import { getCatalogLanguage } from './catalog'

/** A phrase idea, independent of language. `picture` is the emoji scene shown in the player. */
export interface PhraseDef {
  id: string
  english: string
  picture: string
}

export interface Situation {
  id: string
  title: string
  emoji: string
  blurb: string
  /** Tailwind gradient for the situation card */
  gradient: string
  phrases: PhraseDef[]
}

/** A phrase in one target language */
export interface LearnPhrase {
  id: string
  text: string
  romanization?: string
  meaning: string
  picture: string
}

const def = (id: string, english: string, picture: string): PhraseDef => ({ id, english, picture })

/** The two core situations every language has */
const firstWords: Situation = {
  id: 'first-words',
  title: 'First words',
  emoji: '👋',
  blurb: 'Say hi, say bye and mind your manners.',
  gradient: 'from-primary-600 to-emerald-400',
  phrases: [
    def('hello', 'Hello', '👋'),
    def('goodbye', 'Goodbye', '🫡'),
    def('yes', 'Yes', '👍'),
    def('no', 'No', '🙅'),
    def('thanks', 'Thank you', '🙏'),
    def('please', 'Please', '🥺'),
  ],
}

const gettingBy: Situation = {
  id: 'getting-by',
  title: 'Getting by',
  emoji: '🧭',
  blurb: 'Lifesavers for when things get confusing.',
  gradient: 'from-sky-500 to-cyan-400',
  phrases: [
    def('sorry', 'Sorry', '😅'),
    def('dont-understand', "I don't understand", '🤔'),
    def('speak-english', 'Do you speak English?', '🗣️'),
    def('toilet', 'Where is the toilet?', '🚻'),
    def('how-much', 'How much is it?', '🏷️'),
    def('help', 'Help!', '🆘'),
  ],
}

/** Extra situations, available in the five featured languages */
const travelSituations: Situation[] = [
  {
    id: 'restaurant',
    title: 'At the restaurant',
    emoji: '🍝',
    blurb: 'Get a table, order and pay like a regular.',
    gradient: 'from-orange-500 to-amber-400',
    phrases: [
      def('table-for-two', 'A table for two, please', '🍽️'),
      def('menu', 'The menu, please', '📜'),
      def('water', 'I would like some water', '💧'),
      def('delicious', 'This is delicious!', '😋'),
      def('bill', 'The bill, please', '🧾'),
    ],
  },
  {
    id: 'taxi',
    title: 'Taking a taxi',
    emoji: '🚕',
    blurb: 'Tell the driver where to go, and when to stop.',
    gradient: 'from-amber-500 to-yellow-400',
    phrases: [
      def('this-address', 'Take me to this address, please', '📍'),
      def('airport', 'To the airport, please', '✈️'),
      def('how-long', 'How long will it take?', '⏱️'),
      def('stop-here', 'Stop here, please', '🛑'),
      def('keep-change', 'Keep the change', '🪙'),
    ],
  },
  {
    id: 'hotel',
    title: 'At the hotel',
    emoji: '🏨',
    blurb: 'Check in, find breakfast and get online.',
    gradient: 'from-violet-500 to-fuchsia-400',
    phrases: [
      def('reservation', 'I have a reservation', '📋'),
      def('room-tonight', 'Do you have a room for tonight?', '🛏️'),
      def('breakfast', 'What time is breakfast?', '🥐'),
      def('key', 'The key, please', '🔑'),
      def('wifi', 'What is the Wi-Fi password?', '📶'),
    ],
  },
  {
    id: 'shopping',
    title: 'Shopping',
    emoji: '🛍️',
    blurb: 'Browse, try on and pay without the panic.',
    gradient: 'from-rose-500 to-pink-400',
    phrases: [
      def('just-looking', "I'm just looking", '👀'),
      def('smaller-size', 'Do you have a smaller size?', '👕'),
      def('pay-card', 'Can I pay by card?', '💳'),
      def('too-expensive', "That's too expensive", '💸'),
      def('ill-take-it', "I'll take it", '🤝'),
    ],
  },
  {
    id: 'directions',
    title: 'Finding your way',
    emoji: '🗺️',
    blurb: 'Ask for the station and follow the turns.',
    gradient: 'from-teal-500 to-lime-400',
    phrases: [
      def('station', 'Where is the train station?', '🚉'),
      def('left', 'Turn left', '⬅️'),
      def('right', 'Turn right', '➡️'),
      def('straight', 'Go straight ahead', '⬆️'),
      def('far', 'Is it far?', '🧭'),
    ],
  },
]

export const situations: Situation[] = [firstWords, gettingBy, ...travelSituations]
export const coreSituationIds = [firstWords.id, gettingBy.id]

/**
 * Core phrases for every language, in the order of First words + Getting by:
 * hello, goodbye, yes, no, thank you, please, sorry, I don't understand,
 * do you speak English?, where is the toilet?, how much is it?, help!
 */
const core: Record<string, string> = {
  english: "Hello|Goodbye|Yes|No|Thank you|Please|Sorry|I don't understand|Do you speak English?|Where is the toilet?|How much is it?|Help!",
  spanish: "Hola|Adiós|Sí|No|Gracias|Por favor|Lo siento|No entiendo|¿Habla inglés?|¿Dónde está el baño?|¿Cuánto cuesta?|¡Ayuda!",
  french: "Bonjour|Au revoir|Oui|Non|Merci|S'il vous plaît|Désolé|Je ne comprends pas|Parlez-vous anglais ?|Où sont les toilettes ?|C'est combien ?|Au secours !",
  german: "Hallo|Auf Wiedersehen|Ja|Nein|Danke|Bitte|Entschuldigung|Ich verstehe nicht|Sprechen Sie Englisch?|Wo ist die Toilette?|Wie viel kostet das?|Hilfe!",
  mandarin: "你好|再见|是|不是|谢谢|请|对不起|我不明白|你会说英语吗？|厕所在哪里？|多少钱？|救命！",
  albanian: "Përshëndetje|Mirupafshim|Po|Jo|Faleminderit|Ju lutem|Më vjen keq|Nuk kuptoj|A flisni anglisht?|Ku është tualeti?|Sa kushton?|Ndihmë!",
  arabic: "مرحبا|مع السلامة|نعم|لا|شكرا|من فضلك|آسف|لا أفهم|هل تتكلم الإنجليزية؟|أين الحمام؟|بكم هذا؟|النجدة!",
  "moroccan-arabic": "سلام|بسلامة|إيه|لا|شكرا|عافاك|سمح ليا|ما فهمتش|واش كتهضر بالنڭليزية؟|فين كاينة الطواليط؟|بشحال هادا؟|عتقوني!",
  armenian: "Բարև|Ցտեսություն|Այո|Ոչ|Շնորհակալություն|Խնդրում եմ|Ներեցեք|Չեմ հասկանում|Անգլերեն խոսու՞մ եք|Որտե՞ղ է զուգարանը|Ի՞նչ արժե|Օգնությո՜ւն",
  basque: "Kaixo|Agur|Bai|Ez|Eskerrik asko|Mesedez|Barkatu|Ez dut ulertzen|Ingelesez hitz egiten duzu?|Non dago komuna?|Zenbat da?|Lagundu!",
  bengali: "নমস্কার|বিদায়|হ্যাঁ|না|ধন্যবাদ|দয়া করে|দুঃখিত|আমি বুঝতে পারছি না|আপনি কি ইংরেজি বলেন?|টয়লেট কোথায়?|এটার দাম কত?|বাঁচাও!",
  breton: "Demat|Kenavo|Ya|Nann|Trugarez|Mar plij|Digarezit|Ne gomprenan ket|Komz a rit saozneg?|Pelec'h emañ ar privezioù?|Pegement eo?|Sikour!",
  bulgarian: "Здравейте|Довиждане|Да|Не|Благодаря|Моля|Съжалявам|Не разбирам|Говорите ли английски?|Къде е тоалетната?|Колко струва?|Помощ!",
  burmese: "မင်္ဂလာပါ|သွားတော့မယ်|ဟုတ်ကဲ့|မဟုတ်ဘူး|ကျေးဇူးတင်ပါတယ်|ကျေးဇူးပြုပြီး|ဆောရီးပါ|နားမလည်ဘူး|အင်္ဂလိပ်လို ပြောတတ်လား|အိမ်သာ ဘယ်မှာလဲ|ဘယ်လောက်လဲ|ကယ်ပါ",
  catalan: "Hola|Adéu|Sí|No|Gràcies|Si us plau|Ho sento|No ho entenc|Parla anglès?|On és el lavabo?|Quant costa?|Ajuda!",
  corsican: "Bonghjornu|Avvèdeci|Iè|Nò|Grazie|Per piacè|Scusate|Ùn capiscu micca|Parlate inglese?|Induve sò i bagni?|Quantu costa?|Aiutu!",
  croatian: "Bok|Doviđenja|Da|Ne|Hvala|Molim|Oprostite|Ne razumijem|Govorite li engleski?|Gdje je toalet?|Koliko košta?|Upomoć!",
  czech: "Ahoj|Na shledanou|Ano|Ne|Děkuji|Prosím|Promiňte|Nerozumím|Mluvíte anglicky?|Kde je toaleta?|Kolik to stojí?|Pomoc!",
  danish: "Hej|Farvel|Ja|Nej|Tak|Vær så venlig|Undskyld|Jeg forstår ikke|Taler du engelsk?|Hvor er toilettet?|Hvad koster det?|Hjælp!",
  dutch: "Hallo|Tot ziens|Ja|Nee|Dank je wel|Alsjeblieft|Sorry|Ik begrijp het niet|Spreekt u Engels?|Waar is het toilet?|Hoeveel kost het?|Help!",
  estonian: "Tere|Head aega|Jah|Ei|Aitäh|Palun|Vabandust|Ma ei saa aru|Kas te räägite inglise keelt?|Kus on tualett?|Kui palju see maksab?|Appi!",
  finnish: "Hei|Näkemiin|Kyllä|Ei|Kiitos|Ole hyvä|Anteeksi|En ymmärrä|Puhutko englantia?|Missä on vessa?|Paljonko se maksaa?|Apua!",
  greek: "Γεια σας|Αντίο|Ναι|Όχι|Ευχαριστώ|Παρακαλώ|Συγγνώμη|Δεν καταλαβαίνω|Μιλάτε αγγλικά;|Πού είναι η τουαλέτα;|Πόσο κάνει;|Βοήθεια!",
  hebrew: "שלום|להתראות|כן|לא|תודה|בבקשה|סליחה|אני לא מבין|אתה מדבר אנגלית?|איפה השירותים?|כמה זה עולה?|הצילו!",
  hindi: "नमस्ते|अलविदा|हाँ|नहीं|धन्यवाद|कृपया|माफ़ कीजिए|मैं नहीं समझा|क्या आप अंग्रेज़ी बोलते हैं?|शौचालय कहाँ है?|यह कितने का है?|बचाओ!",
  hungarian: "Szia|Viszontlátásra|Igen|Nem|Köszönöm|Kérem|Elnézést|Nem értem|Beszél angolul?|Hol van a mosdó?|Mennyibe kerül?|Segítség!",
  icelandic: "Halló|Bless|Já|Nei|Takk|Vinsamlegast|Fyrirgefðu|Ég skil ekki|Talar þú ensku?|Hvar er klósettið?|Hvað kostar þetta?|Hjálp!",
  indonesian: "Halo|Selamat tinggal|Ya|Tidak|Terima kasih|Tolong|Maaf|Saya tidak mengerti|Apakah Anda bisa berbahasa Inggris?|Di mana toilet?|Berapa harganya?|Tolong saya!",
  italian: "Ciao|Arrivederci|Sì|No|Grazie|Per favore|Mi dispiace|Non capisco|Parla inglese?|Dov'è il bagno?|Quanto costa?|Aiuto!",
  japanese: "こんにちは|さようなら|はい|いいえ|ありがとう|お願いします|ごめんなさい|わかりません|英語を話せますか？|トイレはどこですか？|いくらですか？|助けて！",
  khmer: "សួស្តី|លាហើយ|បាទ / ចាស|ទេ|អរគុណ|សូម|សុំទោស|ខ្ញុំមិនយល់ទេ|តើអ្នកនិយាយភាសាអង់គ្លេសទេ?|បង្គន់នៅឯណា?|តើវាថ្លៃប៉ុន្មាន?|ជួយផង!",
  korean: "안녕하세요|안녕히 계세요|네|아니요|감사합니다|부탁합니다|죄송합니다|이해하지 못했어요|영어 하세요?|화장실이 어디예요?|얼마예요?|도와주세요!",
  latvian: "Sveiki|Uz redzēšanos|Jā|Nē|Paldies|Lūdzu|Atvainojiet|Es nesaprotu|Vai jūs runājat angliski?|Kur ir tualete?|Cik tas maksā?|Palīgā!",
  lithuanian: "Labas|Viso gero|Taip|Ne|Ačiū|Prašau|Atsiprašau|Nesuprantu|Ar kalbate angliškai?|Kur yra tualetas?|Kiek kainuoja?|Padėkite!",
  malay: "Helo|Selamat tinggal|Ya|Tidak|Terima kasih|Sila|Maaf|Saya tidak faham|Boleh cakap bahasa Inggeris?|Di mana tandas?|Berapa harganya?|Tolong!",
  norwegian: "Hei|Ha det|Ja|Nei|Takk|Vær så snill|Unnskyld|Jeg forstår ikke|Snakker du engelsk?|Hvor er toalettet?|Hva koster det?|Hjelp!",
  occitan: "Bonjorn|Adieu|Òc|Non|Mercé|Se vos plai|O planhi|Compreni pas|Parlatz anglés?|Ont son los comuns?|Quant còsta?|Ajuda!",
  persian: "سلام|خداحافظ|بله|نه|ممنون|لطفاً|ببخشید|نمی‌فهمم|انگلیسی صحبت می‌کنید؟|دستشویی کجاست؟|چقدر است؟|کمک!",
  polish: "Cześć|Do widzenia|Tak|Nie|Dziękuję|Proszę|Przepraszam|Nie rozumiem|Czy mówi pan po angielsku?|Gdzie jest toaleta?|Ile to kosztuje?|Pomocy!",
  portuguese: "Olá|Tchau|Sim|Não|Obrigado|Por favor|Desculpe|Não entendo|Você fala inglês?|Onde fica o banheiro?|Quanto custa?|Socorro!",
  romanian: "Bună ziua|La revedere|Da|Nu|Mulțumesc|Vă rog|Îmi pare rău|Nu înțeleg|Vorbiți engleză?|Unde este toaleta?|Cât costă?|Ajutor!",
  russian: "Здравствуйте|До свидания|Да|Нет|Спасибо|Пожалуйста|Извините|Я не понимаю|Вы говорите по-английски?|Где туалет?|Сколько это стоит?|Помогите!",
  serbian: "Здраво|Довиђења|Да|Не|Хвала|Молим|Извините|Не разумем|Да ли говорите енглески?|Где је тоалет?|Колико кошта?|Упомоћ!",
  slovak: "Ahoj|Dovidenia|Áno|Nie|Ďakujem|Prosím|Prepáčte|Nerozumiem|Hovoríte po anglicky?|Kde je toaleta?|Koľko to stojí?|Pomoc!",
  swahili: "Jambo|Kwaheri|Ndiyo|Hapana|Asante|Tafadhali|Samahani|Sielewi|Unazungumza Kiingereza?|Choo kiko wapi?|Ni bei gani?|Msaada!",
  swedish: "Hej|Hej då|Ja|Nej|Tack|Snälla|Förlåt|Jag förstår inte|Pratar du engelska?|Var är toaletten?|Vad kostar det?|Hjälp!",
  tagalog: "Kumusta|Paalam|Oo|Hindi|Salamat|Pakiusap|Pasensya na|Hindi ko naiintindihan|Marunong ka bang mag-Ingles?|Nasaan ang banyo?|Magkano ito?|Tulong!",
  thai: "สวัสดี|ลาก่อน|ใช่|ไม่ใช่|ขอบคุณ|กรุณา|ขอโทษ|ไม่เข้าใจ|คุณพูดภาษาอังกฤษได้ไหม|ห้องน้ำอยู่ที่ไหน|เท่าไหร่|ช่วยด้วย",
  turkish: "Merhaba|Hoşça kal|Evet|Hayır|Teşekkürler|Lütfen|Özür dilerim|Anlamıyorum|İngilizce konuşuyor musunuz?|Tuvalet nerede?|Ne kadar?|İmdat!",
  ukrainian: "Привіт|До побачення|Так|Ні|Дякую|Будь ласка|Вибачте|Я не розумію|Ви розмовляєте англійською?|Де туалет?|Скільки це коштує?|Допоможіть!",
  urdu: "السلام علیکم|خدا حافظ|جی ہاں|نہیں|شکریہ|براہ کرم|معاف کیجیے|میں نہیں سمجھا|کیا آپ انگریزی بولتے ہیں؟|بیت الخلا کہاں ہے؟|یہ کتنے کا ہے؟|بچاؤ!",
  vietnamese: "Xin chào|Tạm biệt|Vâng|Không|Cảm ơn|Làm ơn|Xin lỗi|Tôi không hiểu|Bạn có nói tiếng Anh không?|Nhà vệ sinh ở đâu?|Bao nhiêu tiền?|Cứu tôi với!",
  walloon: "Bondjoû|A r'vey|Oyi|Neni|Merci|S' i vs plait|Escusez|Dji n' comprind nén|Djåzez vs inglès?|Wice sont les cabinets?|Kibén çoûte-t i?|Å secoûrs!",
  zulu: "Sawubona|Hamba kahle|Yebo|Cha|Ngiyabonga|Ngicela|Uxolo|Angiqondi|Uyakhuluma isiNgisi?|Iphi indlu yangasese?|Kubiza malini?|Ngisize!",
}

/** Pronunciation help for languages that do not use the Latin alphabet, same order as `core` */
const coreRomanization: Record<string, string> = {
  mandarin: "nǐ hǎo|zài jiàn|shì|bú shì|xiè xie|qǐng|duì bu qǐ|wǒ bù míng bai|nǐ huì shuō yīng yǔ ma?|cè suǒ zài nǎ lǐ?|duō shao qián?|jiù mìng!",
  arabic: "marhaban|ma'a as-salama|na'am|la|shukran|min fadlak|asif|la afham|hal tatakallam al-injliziya?|ayna al-hammam?|bikam hadha?|an-najda!",
  "moroccan-arabic": "salam|bslama|iyeh|la|shukran|afak|smeh liya|ma fhemtch|wash kat-hder b-ngliziya?|fin kayna t-twalit?|bshhal hada?|'teqquni!",
  armenian: "barev|tstesutyun|ayo|voch|shnorhakalutyun|khndrum em|neretsek|chem haskanum|angleren khosum ek?|vortegh e zugarane?|inch arzhe?|ognutyun!",
  bengali: "nomoshkar|biday|hyan|na|dhonnobad|doya kore|dukkhito|ami bujhte parchhi na|apni ki ingreji bolen?|toilet kothay?|etar dam koto?|bachao!",
  bulgarian: "zdraveyte|dovizhdane|da|ne|blagodarya|molya|sazhalyavam|ne razbiram|govorite li angliyski?|kade e toaletnata?|kolko struva?|pomosht!",
  burmese: "mingalaba|thwa dau me|houk-ke|ma houk bu|kyei-zu tin ba de|kyei-zu pyu bi|so-ri ba|na ma le bu|ingaleik lo pyaw tat la?|ein-tha be hma le?|be lauk le?|ke ba!",
  greek: "yia sas|adío|ne|óchi|efcharistó|parakaló|signómi|den katalavéno|miláte angliká?|pou íne i toualéta?|póso káni?|voíthia!",
  hebrew: "shalom|lehitra'ot|ken|lo|toda|bevakasha|slicha|ani lo mevin|ata medaber anglit?|eifo ha-sherutim?|kama ze ole?|hatsilu!",
  hindi: "namaste|alvida|haan|nahin|dhanyavaad|kripaya|maaf kijiye|main nahin samjha|kya aap angrezi bolte hain?|shauchalay kahaan hai?|yah kitne ka hai?|bachao!",
  japanese: "konnichiwa|sayōnara|hai|iie|arigatō|onegai shimasu|gomen nasai|wakarimasen|eigo o hanasemasu ka?|toire wa doko desu ka?|ikura desu ka?|tasukete!",
  khmer: "suosdei|lea haey|baat / chaa|te|arkoun|soum|somtoh|khnhom min yol te|tae neak niyeay pheasa angkles te?|bangkon nov ae na?|tae vea thlai ponman?|chuoy phong!",
  korean: "annyeonghaseyo|annyeonghi gyeseyo|ne|aniyo|gamsahamnida|butakamnida|joesonghamnida|ihaehaji mothaesseoyo|yeong-eo haseyo?|hwajangsiri eodiyeyo?|eolmayeyo?|dowajuseyo!",
  persian: "salâm|khodâhâfez|bale|na|mamnun|lotfan|bebakhshid|nemifahmam|engelisi sohbat mikonid?|dastshui kojâst?|cheqadr ast?|komak!",
  russian: "zdravstvuyte|do svidaniya|da|net|spasibo|pozhaluysta|izvinite|ya ne ponimayu|vy govorite po-angliyski?|gde tualet?|skolko eto stoit?|pomogite!",
  serbian: "zdravo|doviđenja|da|ne|hvala|molim|izvinite|ne razumem|da li govorite engleski?|gde je toalet?|koliko košta?|upomoć!",
  thai: "sawatdee|la kon|chai|mai chai|khop khun|karuna|kho thot|mai khao jai|khun phut phasa angkrit dai mai?|hong nam yu thi nai?|thao rai?|chuay duay!",
  ukrainian: "pryvit|do pobachennya|tak|ni|dyakuyu|bud laska|vybachte|ya ne rozumiyu|vy rozmovlyayete angliyskoyu?|de tualet?|skilky tse koshtuye?|dopomozhit!",
  urdu: "assalam-o-alaikum|khuda hafiz|ji haan|nahin|shukriya|barah-e-karam|maaf kijiye|main nahin samjha|kya aap angrezi bolte hain?|bait-ul-khala kahan hai?|yeh kitne ka hai?|bachao!",
}

/** Travel situations for the five featured languages, same order as each situation's phrases */
const travel: Record<string, Record<string, string>> = {
  english: Object.fromEntries(travelSituations.map((s) => [s.id, s.phrases.map((p) => p.english).join('|')])),
  spanish: {
    restaurant: "Una mesa para dos, por favor|La carta, por favor|Quisiera agua|¡Está delicioso!|La cuenta, por favor",
    taxi: "Lléveme a esta dirección, por favor|Al aeropuerto, por favor|¿Cuánto tiempo tardará?|Pare aquí, por favor|Quédese con el cambio",
    hotel: "Tengo una reserva|¿Tiene una habitación para esta noche?|¿A qué hora es el desayuno?|La llave, por favor|¿Cuál es la contraseña del wifi?",
    shopping: "Solo estoy mirando|¿Tiene una talla más pequeña?|¿Puedo pagar con tarjeta?|Es demasiado caro|Me lo llevo",
    directions: "¿Dónde está la estación de tren?|Gire a la izquierda|Gire a la derecha|Siga todo recto|¿Está lejos?",
  },
  french: {
    restaurant: "Une table pour deux, s'il vous plaît|La carte, s'il vous plaît|Je voudrais de l'eau|C'est délicieux !|L'addition, s'il vous plaît",
    taxi: "Emmenez-moi à cette adresse, s'il vous plaît|À l'aéroport, s'il vous plaît|Combien de temps faut-il ?|Arrêtez-vous ici, s'il vous plaît|Gardez la monnaie",
    hotel: "J'ai une réservation|Avez-vous une chambre pour ce soir ?|À quelle heure est le petit-déjeuner ?|La clé, s'il vous plaît|Quel est le mot de passe du wifi ?",
    shopping: "Je regarde seulement|Avez-vous une taille plus petite ?|Je peux payer par carte ?|C'est trop cher|Je le prends",
    directions: "Où est la gare ?|Tournez à gauche|Tournez à droite|Allez tout droit|C'est loin ?",
  },
  german: {
    restaurant: "Einen Tisch für zwei, bitte|Die Speisekarte, bitte|Ich hätte gern Wasser|Das ist köstlich!|Die Rechnung, bitte",
    taxi: "Bringen Sie mich bitte zu dieser Adresse|Zum Flughafen, bitte|Wie lange dauert es?|Halten Sie bitte hier|Stimmt so",
    hotel: "Ich habe eine Reservierung|Haben Sie ein Zimmer für heute Nacht?|Wann gibt es Frühstück?|Den Schlüssel, bitte|Wie lautet das WLAN-Passwort?",
    shopping: "Ich schaue nur|Haben Sie das eine Nummer kleiner?|Kann ich mit Karte zahlen?|Das ist zu teuer|Ich nehme es",
    directions: "Wo ist der Bahnhof?|Biegen Sie links ab|Biegen Sie rechts ab|Gehen Sie geradeaus|Ist es weit?",
  },
  mandarin: {
    restaurant: "请给我们一张两人桌|请给我菜单|我想要水|太好吃了！|请结账",
    taxi: "请带我去这个地址|请去机场|要多长时间？|请在这里停车|不用找了",
    hotel: "我有预订|今晚有房间吗？|早餐几点？|请给我钥匙|无线网密码是什么？",
    shopping: "我只是看看|有小一号的吗？|可以刷卡吗？|太贵了|我要这个",
    directions: "火车站在哪里？|向左转|向右转|一直走|远吗？",
  },
}

const travelRomanization: Record<string, Record<string, string>> = {
  mandarin: {
    restaurant: "qǐng gěi wǒ men yì zhāng liǎng rén zhuō|qǐng gěi wǒ cài dān|wǒ xiǎng yào shuǐ|tài hǎo chī le!|qǐng jié zhàng",
    taxi: "qǐng dài wǒ qù zhè ge dì zhǐ|qǐng qù jī chǎng|yào duō cháng shí jiān?|qǐng zài zhè lǐ tíng chē|bú yòng zhǎo le",
    hotel: "wǒ yǒu yù dìng|jīn wǎn yǒu fáng jiān ma?|zǎo cān jǐ diǎn?|qǐng gěi wǒ yào shi|wú xiàn wǎng mì mǎ shì shén me?",
    shopping: "wǒ zhǐ shì kàn kan|yǒu xiǎo yí hào de ma?|kě yǐ shuā kǎ ma?|tài guì le|wǒ yào zhè ge",
    directions: "huǒ chē zhàn zài nǎ lǐ?|xiàng zuǒ zhuǎn|xiàng yòu zhuǎn|yì zhí zǒu|yuǎn ma?",
  },
}

const split = (s: string | undefined) => (s ? s.split('|') : undefined)

/** Every situation, with whether it is unlocked for this language */
export function situationsFor(langId: string) {
  const hasTravel = !!travel[langId]
  return situations.map((s) => ({ ...s, available: coreSituationIds.includes(s.id) || hasTravel }))
}

export const getSituation = (id: string | undefined) => situations.find((s) => s.id === id)

/** The phrases of one situation in one language, or an empty list if not available */
export function phrasesFor(langId: string, situationId: string): LearnPhrase[] {
  const situation = getSituation(situationId)
  if (!situation || !getCatalogLanguage(langId)) return []

  let texts: string[] | undefined
  let roman: string[] | undefined
  if (coreSituationIds.includes(situationId)) {
    const offset = situationId === firstWords.id ? 0 : firstWords.phrases.length
    const n = situation.phrases.length
    texts = split(core[langId])?.slice(offset, offset + n)
    roman = split(coreRomanization[langId])?.slice(offset, offset + n)
  } else {
    texts = split(travel[langId]?.[situationId])
    roman = split(travelRomanization[langId]?.[situationId])
  }
  if (!texts) return []

  return situation.phrases.map((p, i) => ({
    id: p.id,
    text: texts[i],
    romanization: roman?.[i],
    meaning: p.english,
    picture: p.picture,
  }))
}

/** Look up a single phrase by language and phrase id (used by the review queue) */
export function findPhrase(langId: string, phraseId: string) {
  for (const s of situationsFor(langId)) {
    if (!s.available || !s.phrases.some((p) => p.id === phraseId)) continue
    const phrase = phrasesFor(langId, s.id).find((p) => p.id === phraseId)
    if (phrase) return { phrase, situation: s }
  }
  return undefined
}
