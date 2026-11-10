# Schriften

Selbst gehostet, damit die App im Hörsaal ohne Netz läuft.

| Datei | Quelle | Umfang |
|---|---|---|
| `stix-two-text-400.woff2`, `-600.woff2`, `-400-italic.woff2` | STIX Two Text (Google Fonts, v18), mit `pyftsubset` reduziert | Latein, Latein erweitert, Griechisch, Satzzeichen, Hoch-/Tiefstellung, ℝ usw. |
| `stix-two-math-symbols.woff2` | STIX Two Math (Google Fonts, v12), reduziert | Pfeile, Mengen- und Vergleichszeichen, ∘, ◇ |

Atkinson Hyperlegible Next (für die Bedienelemente) kommt über `@fontsource/atkinson-hyperlegible-next`.

Beide STIX-Familien stehen unter der SIL Open Font License 1.1 (https://openfontlicense.org), © The STIX Fonts Project / STI Pub Companies. Die reduzierten Dateien sind „Modified Versions" im Sinne der Lizenz und tragen weiter die Originalnamen der Schriftfamilie, was die OFL ohne Reserved Font Name erlaubt.

Neu erzeugen:

```
pyftsubset STIXTwoText-Regular.ttf --unicodes="U+0000-024F,U+0370-03FF,U+2000-206F,U+2070-209F,U+20AC,U+2100-214F" --flavor=woff2 --layout-features='*' --output-file=stix-two-text-400.woff2
pyftsubset STIXTwoMath-Regular.ttf --unicodes="U+2070-209F,U+2100-214F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+27E8-27EF,U+2713" --flavor=woff2 --output-file=stix-two-math-symbols.woff2
```
