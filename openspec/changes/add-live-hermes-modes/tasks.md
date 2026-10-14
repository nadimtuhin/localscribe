## 1. Units (TDD)

- [x] 1.1 `?` routing in the session
- [x] 1.2 Ask queue: priority over auto, never concurrent (fake runner + clock)
- [x] 1.3 Role prompt builder, context blocks and caps
- [x] 1.4 Question detection and debounce in cadence
- [x] 1.5 Flag parsing: `--role`, repeatable `--context`, missing file error
- [x] 1.6 Role line in the final notes prompt

## 2. Wiring

- [x] 2.1 `live` command loads context files, shows `Q:`/`A:` rows
- [x] 2.2 Help text

## 3. Verification

- [x] 3.1 Real Hermes: one inline ask and one candidate-role auto suggestion against a fixture `live.txt`
