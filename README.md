# Nativ

Nativ plans to be a alternative frontend for many common video sharing sites and platforms. Nativ's goal is to- well- be native. In this case, that means no electron or bloated websites, though right now is written completely in javascript but that is [subject to change](https://github.com/bobvarioa/jsvm). 

Nativ is largely work in progress, as you can see from the todolist below.

# Development
To build nativ:
```
node ./scripts/build.mjs
```

To run nativ:
```
node ./dist/index.cjs 
```

The `-v`, `-vv`, `-vvv`, etc. flags can be added to change the log's verbosity.

# Todolist
- Widgets:
	- [ ] Chip (Bar)
	- [ ] Top navbar
	- [ ] Tabbed container
	- [ ] Scroll Areas
	- [ ] Side Hamburger menu
	- [ ] Popup tooltips (see notifications menu)
	- [ ] Search (suggested results)
	- [ ] Video Player
		- [x] Play
		- [x] Pause 
		- [~] Seek
		- [x] Volume control
		- [ ] Captions
		- [ ] Track select 
		- [ ] Pop-out player
		- [x] Full screen 
		- [ ] Speed Control
		- [ ] Segments / Chapters
		- [ ] Info cards
		- [ ] End cards
		- [ ] Video information modal
- General
	- [x] Ui language that is not glade
		- [x] Creates gtk components
		- [x] Esbuild Plugin
		- [x] Typescript definitions
		- [ ] Templates
		- [ ] Events / Callbacks 
	- [ ] Navigate between pages 
	- [ ] Restart videos at last played position
	- [ ] Watch History
	- [x] Description
	- [ ] Comments 
	- [ ] Recommended videos
	- [ ] Subscriptions
	- [ ] Search
	- [ ] Playlists
	- [ ] Queue
	- [ ] User Preferences
- Additional
	- [ ] Sponsorblock
	- [ ] Video download
		- [ ] Auto download subscriptions / Download rules
	- [ ] 

Sources:
- https://wiki.sponsor.ajay.app/w/API_Docs
- https://github.com/romgrk/node-gtk/blob/master/examples/entry.js
- https://github.com/romgrk/node-gtk/blob/master/doc/index.md
- https://github.com/romgrk/node-gtk/blob/master/examples/builderExample.glade
- https://github.com/romgrk/node-gtk/blob/master/doc/index.md
- https://docs.gtk.org/gtk4/class.Entry.html
- https://github.com/LuanRT/YouTube.js/tree/main
- https://github.com/LuanRT/YouTube.js/tree/main/examples

- https://docs.gtk.org/gtk3/visual_index.html
- https://docs.gtk.org/gtk3/getting_started.html
- https://docs.gtk.org/gtk3/css-overview.html