# AURUM Fitness

A multi-page luxury gym website, built as a front-end portfolio demo. AURUM is a fictional brand, and all names, prices and addresses are sample content.

## Pages

- `index.html`: home, with hero, stats, featured programs and call to action
- `about.html`: story, principles, timeline and facilities
- `programs.html`: eight programs with filter tabs
- `trainers.html`: six lead coaches
- `membership.html`: three plans with a monthly/annual toggle and FAQ
- `contact.html`: tour request form (demo only, nothing is sent)

## Interaction

- Custom gold cursor with a glowing particle trail
- Gold shockwave rings and a spark burst on every click or tap
- Magnetic buttons, tilt and spotlight cards, and a cursor-lit grid in the hero
- Scroll reveals, animated counters, a scroll progress bar and page fade transitions
- Respects `prefers-reduced-motion`, and uses tap effects instead of the custom cursor on touch devices

## Stack

Plain HTML, CSS and JavaScript with no build step and no dependencies. Fonts (Cormorant Garamond and Manrope) load from Google Fonts.

## Run locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## Deploy on GitHub Pages

In the repository settings, open Pages, choose "Deploy from a branch", then select `main` and the `/ (root)` folder.
