# How the project editor works

A tool for correcting and completing the record of each project: its name, sector, country, stage and key dates. Several people can work at the same time without erasing each other's work.

[Open the project list](/ "button")

## Who is it for?

**Editors and analysts.** People who keep the project information up to date: they change a stage, add a date or correct a country.

**Coordinators.** People who check that each record is complete and want to know that nobody wiped out another person's change.

## How to use it, in three steps

1. **Find the project**\
   In [Projects](/) you see the full list. Type part of the name, or filter by country or sector, and click the row.
2. **Change what you need**\
   The record opens. You can change the name, the sector, the country, the stage and the key dates. The linked companies and the rest of the information are shown for reading only.
3. **Save**\
   Press **Save changes**. You will see the message "Changes saved". If another person changed the same thing as you, the tool asks you before saving.

> **Tip**
> Sometimes a project takes a few seconds to open or to save. That is normal: the information comes from another system. You do not need to press Save twice.

### Checking whether it was saved

Now and then the other system takes too long to answer, and the tool cannot tell if your change went through. Instead of guessing, it shows **Checking whether it was saved...**, looks at the project again, and then tells you one of two things: your change is there ("Changes saved"), or it is not and you can try again with one click. Your text stays on screen the whole time, so nothing you typed is lost.

## What happens if two people edit at the same time?

Nothing is lost in silence. The tool looks at **which piece of information** each person changed, not only at who pressed Save last.

### Case 1: they change different things

Ana and Luis open the same project, "Parque Solar Atacama Norte" (an example).

| Time | Ana | Luis |
|---|---|---|
| 10:00 | Opens the record | Opens the record |
| 10:05 | Changes the stage to "Construction" and saves | |
| 10:07 | | Changes the country to "Chile" and saves |

**Both are kept.** The record ends up with Ana's stage and Luis's country. Luis sees no question.

### Case 2: they change the same thing

Both change the key date "Award".

| Time | Ana | Luis |
|---|---|---|
| 10:05 | Sets 15/03/2027 and saves | |
| 10:07 | | Sets 30/04/2027 and presses Save |

**Luis decides.** Because Luis saved second, the tool opens a window titled "Someone else saved this project while you were editing it". It shows the two versions side by side:

| Current value, Award | My value, Award |
|---|---|
| 15/03/2027 | 30/04/2027 |

Luis picks one of the two and presses **Save my selection**.

> **Note**
> Each key date counts as its own piece of information, by its name. If Ana changes "Award" and Luis changes "Start of works", both are kept without asking anyone.

## Frequently asked questions

### What can I edit?

The name, the sector, the country, the stage and the key dates. Everything else, including the linked companies, is shown so you have the context, but it cannot be changed here.

### Why are the linked companies read-only?

This first version only edits the main information and the key dates. The companies are shown next to them so you can see who is involved, and they are kept exactly as they were when you save. Changing them is left for a later version.

### What if I close the tab?

Changes you have not saved are not kept. If you press Save and then close the tab at once, wait for "Changes saved" (or for the check described above to finish) before you leave. Open the project again to see exactly what is stored.

### Can I lose what I typed?

Not without you knowing. If your change collides with another person's, the tool tells you and lets you choose before saving.

### Every night new information arrives. Does it affect me?

Each night an automatic process updates some projects. If it updated the same piece of information you are changing, you will see it as a question, exactly as with another person.

Want to install it or change it? Read the [Step-by-step guide](/docs/guide) or the [Technical documentation](/docs/technical).
