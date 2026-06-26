# Japanese frequency list

`leeds-japanese-44998.txt` — the 44,998 most common Japanese words in descending
frequency order (one word per line; **line number = frequency rank**).

- Source: [hingston/japanese](https://github.com/hingston/japanese), derived from
  the University of Leeds *Corpus of Internet Japanese* frequency data
  (CC BY 2.5 / CC BY 4.0 attribution).
- Used by `scripts/backfill-frequency-rank.ts` to fill
  `VocabularyEntry.frequencyRank`, which drives the new-word learning order
  ("learn common words first") instead of the raw gojūon source order.

Matching notes (see the backfill script for the exact logic):

- Match by **writing form first**; only fall back to the kana reading for words
  that are written in kana. Matching kanji words by their reading would collide
  with high-frequency particles (e.g. 二→に, 歯→は), wrongly inflating their rank.
- Honorific お/ご prefixes and the ～ counter placeholder are stripped for a
  secondary match attempt.
- ~96% of the 718 N5 entries get a rank; the rest keep `frequencyRank = null`
  and fall back to source order at the tail.
