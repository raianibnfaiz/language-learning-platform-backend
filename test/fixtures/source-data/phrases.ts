// Test fixture in the same shape as the client's source-data/phrases.ts.
export interface Situation {
  id: string
  title: string
  emoji: string
  blurb: string
  gradient: string
  phrases: { id: string; english: string; picture: string }[]
}

export const situations: Situation[] = [
  { id: 'first-words', title: 'First words', emoji: '👋', blurb: 'Start here', gradient: 'from-sky-400 to-blue-500', phrases: [
    { id: 'hello', english: 'Hello', picture: '👋' }, { id: 'goodbye', english: 'Goodbye', picture: '🚪' },
    { id: 'yes', english: 'Yes', picture: '✅' }, { id: 'no', english: 'No', picture: '❌' },
    { id: 'thanks', english: 'Thank you', picture: '🙏' }, { id: 'please', english: 'Please', picture: '🥺' } ] },
  { id: 'getting-by', title: 'Getting by', emoji: '🧭', blurb: 'Survive', gradient: 'from-amber-400 to-orange-500', phrases: [
    { id: 'sorry', english: 'Sorry', picture: '😔' }, { id: 'dont-understand', english: "I don't understand", picture: '🤷' },
    { id: 'speak-english', english: 'Do you speak English?', picture: '🗣️' }, { id: 'toilet', english: 'Where is the toilet?', picture: '🚻' },
    { id: 'how-much', english: 'How much is it?', picture: '💶' }, { id: 'help', english: 'Help!', picture: '🆘' } ] },
  { id: 'restaurant', title: 'Restaurant', emoji: '🍽️', blurb: 'Eat', gradient: 'g', phrases: [
    { id: 'table-for-two', english: 'A table for two, please', picture: '🪑' }, { id: 'menu', english: 'The menu, please', picture: '📜' },
    { id: 'water', english: 'Water, please', picture: '💧' }, { id: 'delicious', english: 'Delicious!', picture: '😋' },
    { id: 'bill', english: 'The bill, please', picture: '🧾' } ] },
  { id: 'taxi', title: 'Taxi', emoji: '🚕', blurb: 'Ride', gradient: 'g', phrases: [
    { id: 'this-address', english: 'To this address, please', picture: '📍' }, { id: 'airport', english: 'To the airport', picture: '✈️' },
    { id: 'how-long', english: 'How long will it take?', picture: '⏱️' }, { id: 'stop-here', english: 'Stop here, please', picture: '🛑' },
    { id: 'keep-change', english: 'Keep the change', picture: '🪙' } ] },
  { id: 'hotel', title: 'Hotel', emoji: '🏨', blurb: 'Stay', gradient: 'g', phrases: [
    { id: 'reservation', english: 'I have a reservation', picture: '📋' }, { id: 'room-tonight', english: 'A room for tonight?', picture: '🛏️' },
    { id: 'breakfast', english: 'Is breakfast included?', picture: '🥐' }, { id: 'key', english: 'My key, please', picture: '🔑' },
    { id: 'wifi', english: 'What is the Wi-Fi password?', picture: '📶' } ] },
  { id: 'shopping', title: 'Shopping', emoji: '🛍️', blurb: 'Buy', gradient: 'g', phrases: [
    { id: 'just-looking', english: "I'm just looking", picture: '👀' }, { id: 'smaller-size', english: 'A smaller size?', picture: '📏' },
    { id: 'pay-card', english: 'Can I pay by card?', picture: '💳' }, { id: 'too-expensive', english: "It's too expensive", picture: '💸' },
    { id: 'ill-take-it', english: "I'll take it", picture: '🛒' } ] },
  { id: 'directions', title: 'Directions', emoji: '🗺️', blurb: 'Find', gradient: 'g', phrases: [
    { id: 'station', english: 'Where is the station?', picture: '🚉' }, { id: 'left', english: 'Left', picture: '⬅️' },
    { id: 'right', english: 'Right', picture: '➡️' }, { id: 'straight', english: 'Straight ahead', picture: '⬆️' },
    { id: 'far', english: 'Is it far?', picture: '🏞️' } ] },
]

export const core: Record<string, string> = {
  spanish: 'Hola|Adiós|Sí|No|Gracias|Por favor|Lo siento|No entiendo|¿Habla inglés?|¿Dónde está el baño?|¿Cuánto cuesta?|¡Ayuda!',
  english: "Hello|Goodbye|Yes|No|Thank you|Please|Sorry|I don't understand|Do you speak English?|Where is the toilet?|How much is it?|Help!",
  japanese: 'こんにちは|さようなら|はい|いいえ|ありがとう|お願いします|すみません|わかりません|英語を話せますか|トイレはどこですか|いくらですか|助けて',
}

export const coreRomanization: Record<string, string> = {
  japanese: 'konnichiwa|sayōnara|hai|iie|arigatō|onegaishimasu|sumimasen|wakarimasen|eigo o hanasemasu ka|toire wa doko desu ka|ikura desu ka|tasukete',
}

export const travel: Record<string, Record<string, string>> = {
  spanish: {
    restaurant: 'Una mesa para dos, por favor|La carta, por favor|Agua, por favor|¡Delicioso!|La cuenta, por favor',
    taxi: 'A esta dirección, por favor|Al aeropuerto|¿Cuánto tarda?|Pare aquí, por favor|Quédese con el cambio',
    hotel: 'Tengo una reserva|¿Una habitación para esta noche?|¿El desayuno está incluido?|Mi llave, por favor|¿Cuál es la contraseña del wifi?',
    shopping: 'Solo estoy mirando|¿Una talla más pequeña?|¿Puedo pagar con tarjeta?|Es demasiado caro|Me lo llevo',
    directions: '¿Dónde está la estación?|Izquierda|Derecha|Todo recto|¿Está lejos?',
  },
  english: {
    restaurant: 'A table for two, please|The menu, please|Water, please|Delicious!|The bill, please',
    taxi: 'To this address, please|To the airport|How long will it take?|Stop here, please|Keep the change',
    hotel: 'I have a reservation|A room for tonight?|Is breakfast included?|My key, please|What is the Wi-Fi password?',
    shopping: "I'm just looking|A smaller size?|Can I pay by card?|It's too expensive|I'll take it",
    directions: 'Where is the station?|Left|Right|Straight ahead|Is it far?',
  },
}

export const travelRomanization: Record<string, Record<string, string>> = {}
