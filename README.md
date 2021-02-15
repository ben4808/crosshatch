# CrossHatch

CrossHatch is a crossword construction app. Its goal is to provide a free yet capable tool that allows anyone to make puzzles they can be proud of.

It runs entirely within the browser, meaning it is cross platform and no installation is required. It also requires no backend server and runs perfectly offline.

There is no registration fee, and the source code is freely available. https://github.com/ben4808/crosshatch

## Features
- Interactive autofill based on your word list
- Fill grids one section at a time
- Heuristics based manual fill shows which words word best with the fill around them
- Easy interface for clue editing
- Save and load .puz files (though no rebus yet)

## Tutorial
First, load a word list. The app supports .dict and .txt word lists. It does not currently support entries containing numbers or special characters, or entries longer than 15 letters.

Second, enter your theme/seed entries and design your grid. Grid width and height can be changed by updating the boxes in the top bar and clicking "New Puzzle". Black squares can be toggled with the `.` (period) key. Circled squares can be toggled with the `,` (comma) key. Rebuses are not currently supported.

As you select words in the grid, CrossHatch will populate the Entry Candidates box with entries ranked by how well they fit with the entries around them in the grid and by their quality score. 

[image 1]

In some cases, this calculation can take a few seconds, which can be annoying when performing lots of operations quickly. You can uncheck "Use Heuristics" and the Entry Candidates box will be populated with everything that fits in the selected slot regardless of the entries around it, which is a much faster operation.

Third, build out your fill. This can be done word by word in many cases using the Entry Candidates box with heuristics. You can also use the autofill mode to find complete fills for the entire grid or just a section of the grid at a time. Potential fills will show up in the Fills box, ranked by how many Good quality words they contain. You can manually enter letters into the grid after generating fills to filter the fills down to more attractive options. If your list of fills gets long, you can also uncheck the "Show" box to hide them and keep the fill algorithm running faster.

[image 2]

Fourth, switch to the the Clues tab and write the clues for your words. Clues can be edited by clicking a clue, entering the new value, and pressing enter.

[image 3]

Finally, export a .puz file and share it with your friends! I recommend https://squares.io/ for fun collaborative solving, https://crosshare.org/ for sharing with friends, and https://crosswordnexus.com/apps/puz-to-pdf/ for converting your puzzle into a printable PDF.

### Iffies
Many times there is no fill possible for a certain section using the words in your word list, but there are fills possible with the use of one "word" not in your list, i.e. a random string of letters. This random "word" is an iffy. Short iffies, especially 3-4 letters, might be workable as an acronyms or even a real words you have neglected in your word list. After changing the Max Iffy Length dropdown, the algorithm will start considering one iffy per section. This can slow down performance somewhat.
### Entry Quality
CrossHatch uses a simplified approach to grading entry quality.

*Good* are entries scored 50 or above in your word list, or unscored words. Good words are scored higher and used more preferentially by the fill algorithm. They appear in gray in the grid.

*Okay* are entries scored 40-49 in your word list. They appear in orange in the grid.

*Iffies* are entries not in your word list that might help the fill succeed. They appear in rusty red in the grid.
## Contributing
CrossHatch is an open source project under the MIT License. You are welcome to use modify the code for your own purposes and submit pull requests to the repo.

It is written in TypeScript using the React. To run it locally, simply clone the repo and run `npm install` and `npm start`. 
