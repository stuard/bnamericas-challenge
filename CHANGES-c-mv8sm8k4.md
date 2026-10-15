# Cambios c-mv8sm8k4 (Glosario para principiantes en la guía) — rama task/c-mv8sm8k4

## Qué estaba mal
La guía paso a paso no tenía un glosario completo: solo una lista corta de palabras al inicio, sin ejemplos del proyecto.

## Qué cambió
Se agregó la sección «## Glossary» en `docs/guide.md`, antes de «When you finish», con 12 términos (API, backend, frontend, upstream, endpoint, merge, conflicto, terminal, uv, Node, puerto, JSON). Cada uno tiene una definición de una frase y un ejemplo del proyecto. Al ser un título de nivel 2, aparece solo en «On this page» y en «Jump to section».

## Medido
Son 12 términos. La página arma el índice con los títulos `##`, así que no hizo falta tocar código. No pude correr la prueba de la página porque la máquina no tiene `node_modules`.

## Pasos para revisarlo

1. Abrí https://bnamericas-project-stage.triominion.com/docs/guide (en la compu y en el teléfono): ves la guía con la sección «Glossary» cerca del final, con 12 términos y un ejemplo en cada uno.
2. Mirá «On this page» (o tocá «Jump to section»): aparece «Glossary» y al tocarlo la página baja a esa sección.
