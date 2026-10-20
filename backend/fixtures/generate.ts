// Erzeugt eine fiktive Musterfamilie im Format der Gramps-Web-API.
// Aufruf: node fixtures/generate.ts > fixtures/familie-muster.json
import type { RawDatabase, RawDate, RawEvent, RawFamily, RawPerson } from '../src/gramps/raw.ts'

type Spec = {
  id: string
  first: string
  last: string
  gender: 0 | 1
  birth?: [number, number, number, string?] // Tag, Monat, Jahr, Ort
  death?: [number, number, number, string?]
  private?: boolean
  note?: string
  photo?: boolean
}

const people: Spec[] = [
  { id: 'I0001', first: 'Johann', last: 'Muster', gender: 1, birth: [3, 4, 1872, 'P1'], death: [12, 1, 1941, 'P1'], photo: true, note: 'Johann war Schmied in Oberdorf und führte die Werkstatt seines Vaters weiter.' },
  { id: 'I0002', first: 'Maria', last: 'Huber', gender: 0, birth: [0, 0, 1875, 'P2'], death: [8, 9, 1950, 'P1'], photo: true },
  { id: 'I0003', first: 'Georg', last: 'Muster', gender: 1, birth: [21, 6, 1899, 'P1'], death: [2, 2, 1972, 'P3'], photo: true },
  { id: 'I0004', first: 'Anna', last: 'Muster', gender: 0, birth: [14, 2, 1902, 'P1'], death: [30, 11, 1988, 'P3'] },
  { id: 'I0005', first: 'Elisabeth', last: 'Weber', gender: 0, birth: [5, 10, 1903, 'P4'], death: [17, 5, 1979, 'P3'], photo: true },
  { id: 'I0006', first: 'Friedrich', last: 'Weber', gender: 1, birth: [0, 0, 1870, 'P4'], death: [0, 0, 1932, 'P4'] },
  { id: 'I0007', first: 'Katharina', last: 'Schmid', gender: 0, birth: [0, 0, 1874] },
  { id: 'I0008', first: 'Heinrich', last: 'Muster', gender: 1, birth: [9, 8, 1928, 'P3'], death: [3, 3, 2009, 'P3'], photo: true, note: 'Heinrich wanderte 1952 nach Kanada aus und kehrte 1960 zurück.' },
  { id: 'I0009', first: 'Margarete', last: 'Muster', gender: 0, birth: [1, 12, 1931, 'P3'], death: [22, 7, 2015, 'P5'] },
  { id: 'I0010', first: 'Ingrid', last: 'Lang', gender: 0, birth: [19, 3, 1933, 'P5'], death: [11, 11, 2020, 'P3'] },
  { id: 'I0011', first: 'Peter', last: 'Muster', gender: 1, birth: [7, 5, 1958, 'P3'], photo: true },
  { id: 'I0012', first: 'Sabine', last: 'Muster', gender: 0, birth: [24, 9, 1961, 'P3'] },
  { id: 'I0013', first: 'Claudia', last: 'Berger', gender: 0, birth: [2, 1, 1960, 'P6'] },
  { id: 'I0014', first: 'Thomas', last: 'Muster', gender: 1, birth: [15, 6, 1987, 'P6'] },
  { id: 'I0015', first: 'Julia', last: 'Muster', gender: 0, birth: [30, 8, 1990, 'P6'], private: true },
  { id: 'I0016', first: 'Lena', last: 'Muster', gender: 0, birth: [4, 4, 2018, 'P6'] },
  { id: 'I0017', first: 'Karl', last: 'Huber', gender: 1, birth: [0, 0, 1845, 'P2'], death: [0, 0, 1910, 'P2'] },
  { id: 'I0018', first: 'Theresia', last: 'Maier', gender: 0, birth: [0, 0, 1849, 'P2'], death: [0, 0, 1921, 'P2'] },
  { id: 'I0019', first: 'Martin', last: 'Vogel', gender: 1, birth: [12, 12, 1955, 'P5'] },
  { id: 'I0020', first: 'Sophie', last: 'Vogel', gender: 0, birth: [6, 7, 1984, 'P5'] },
]

// [Vater, Mutter, Kinder, Heiratsjahr?]
const families: [string | null, string | null, string[], number?][] = [
  ['I0001', 'I0002', ['I0003', 'I0004'], 1897],
  ['I0006', 'I0007', ['I0005'], 1899],
  ['I0003', 'I0005', ['I0008', 'I0009'], 1926],
  ['I0008', 'I0010', ['I0011', 'I0012'], 1956],
  ['I0011', 'I0013', ['I0014', 'I0015'], 1985],
  ['I0014', null, ['I0016']],
  ['I0017', 'I0018', ['I0002'], 1870],
  ['I0019', 'I0012', ['I0020'], 1982],
]

const placeNames: Record<string, [string, string?]> = {
  P1: ['Oberdorf', 'P7'], P2: ['Unterbach', 'P7'], P3: ['Neustadt', 'P8'], P4: ['Waldheim', 'P8'],
  P5: ['Seeburg', 'P8'], P6: ['Bergstadt'], P7: ['Landkreis Talheim'], P8: ['Landkreis Hochfeld'],
}

const h = (prefix: string, id: string) => `${prefix}${id.toLowerCase()}`
const date = ([d, m, y]: [number, number, number, string?]): RawDate =>
  ({ dateval: [d, m, y, false], modifier: 0, quality: 0, text: '', sortval: y * 372 + m * 31 + d })

const db: RawDatabase = { people: [], families: [], events: [], places: [], notes: [], media: [], defaultPerson: h('p', 'I0011') }

for (const [pid, [name, parent]] of Object.entries(placeNames)) {
  db.places.push({ handle: h('pl', pid), name: { value: name }, placeref_list: parent ? [{ ref: h('pl', parent) }] : [], private: false })
}

const event = (id: string, type: string, d: [number, number, number, string?]) => {
  const e: RawEvent = { handle: h('e', id), type, date: date(d), place: d[3] ? h('pl', d[3]) : '', description: '', note_list: [], private: false }
  db.events.push(e)
  return e.handle
}

for (const s of people) {
  const refs = []
  if (s.birth) refs.push({ ref: event(`${s.id}b`, 'Birth', s.birth), role: 'Primary' })
  if (s.death) refs.push({ ref: event(`${s.id}d`, 'Death', s.death), role: 'Primary' })
  const notes = s.note ? [h('n', s.id)] : []
  if (s.note) db.notes.push({ handle: h('n', s.id), text: { string: s.note }, type: 'Person Note', private: false })
  const media = s.photo ? [{ ref: h('m', s.id), rect: [20, 5, 80, 65] }] : []
  if (s.photo) db.media.push({ handle: h('m', s.id), mime: 'image/svg+xml', desc: `Foto ${s.first} ${s.last}`, private: false })
  const p: RawPerson = {
    handle: h('p', s.id), gramps_id: s.id, gender: s.gender,
    primary_name: { first_name: s.first, surname_list: [{ surname: s.last, primary: true }] },
    event_ref_list: refs, birth_ref_index: s.birth ? 0 : -1, death_ref_index: s.death ? (s.birth ? 1 : 0) : -1,
    family_list: [], parent_family_list: [], media_list: media, note_list: notes, private: !!s.private,
  }
  db.people.push(p)
}

const byId = new Map(db.people.map(p => [p.gramps_id, p]))
families.forEach(([father, mother, children, year], i) => {
  const fid = `F${String(i + 1).padStart(4, '0')}`
  const f: RawFamily = {
    handle: h('f', fid), father_handle: father ? h('p', father) : null, mother_handle: mother ? h('p', mother) : null,
    child_ref_list: children.map(c => ({ ref: h('p', c) })), event_ref_list: [], private: false,
  }
  if (year) f.event_ref_list.push({ ref: event(`${fid}m`, 'Marriage', [0, 0, year]), role: 'Family' })
  db.families.push(f)
  for (const parent of [father, mother]) if (parent) byId.get(parent)!.family_list.push(f.handle)
  for (const c of children) byId.get(c)!.parent_family_list.push(f.handle)
})

process.stdout.write(JSON.stringify(db, null, 1) + '\n')
