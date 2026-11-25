# Launchpad website DSL v1

Give this file and a website request to an AI. Ask it to return only a complete DSL program as plain text. In Launchpad, choose **Build from text**, paste the program and select **Compile website**. Each successful compile creates a fresh editable website draft. Preview and publish it from the editor.

## A complete two-page site

    site Pine Walks using summit
    title Explore the pine forest
    intro Small-group hikes every Saturday.
    button Choose a walk to Trips
    page Trips
    section This week's walks
    details Meet your guide at the trailhead.
    list Forest loop / Ridge trail
    faq What should I bring? | Water and sturdy shoes.
    form Ask about a walk | Name / Email / Message
    button Back home to Home

## Commands

Write one command per line. Keywords are lowercase. Values are ordinary unquoted text. Spaces inside values are literal. Blank lines and whole lines beginning with // are ignored. The first matching spaced separator splits the values. There is no escape syntax. Rewrite a label if it contains a reserved separator for its command.

| Line | Effect |
| --- | --- |
| site NAME using TEMPLATE | Required first command. Choose studio (portfolio), summit (outdoors), brew (café), or blank. The template supplies the home page's starting content and appearance. |
| page NAME | Create a page with default content or select an existing page. Home is selected initially. Match names exactly, including case. |
| title TEXT | Set the current page's headline. |
| intro TEXT | Set its introduction. |
| section TEXT | Set its main section title. |
| details TEXT | Set its main section paragraph. |
| color #336655 | Set its accent color using six hexadecimal digits. New pages inherit the current Home color at creation. |
| button LABEL to PAGE | Set the page's main navigation button. Destinations may be declared later. |
| heading TEXT | Append a heading. |
| text TEXT | Append a paragraph. |
| list ITEM / ITEM | Append a bullet list. Separate any number of items with a spaced slash. |
| faq QUESTION &#124; ANSWER | Append an expandable answer. |
| quote WORDS &#124; AUTHOR | Append an attributed quotation. |
| columns LEFT &#124; RIGHT | Append two text columns. |
| form TITLE &#124; Name / Email / Message | Append a form with up to eight field labels. |
| checklist TITLE &#124; TASK / TASK | Append an interactive checklist. |
| callout TITLE &#124; MESSAGE | Append a highlighted message. |

Use a single vertical bar with a space on each side for two-part blocks. Page settings replace earlier values. Blocks appear in source order within each page. Every button destination must exist. A compilation error identifies the source line and leaves the source open for correction.

## Generation limits

Use up to 12 pages including Home and 30 appended blocks per page. Maximum lengths in UTF-16 code units are 70 for the site name, 50 for page names and button labels, 100 for title, 350 for intro, 85 for section, 900 for details and 700 per block argument. All arguments require content. Use the listed commands for template websites. Arbitrary JavaScript, custom backend logic, games and video editing are outside v1.
