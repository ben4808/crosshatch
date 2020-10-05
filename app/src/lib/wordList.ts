import { Entry } from "../models/Entry";
import { IndexedWordList } from "../models/IndexedWordList";
import { QualityClass } from "../models/QualityClass";
import Globals from './windowService';

// function saveBucketsToFile(buckets: any, filename: string) {
//     var json = JSON.stringify(Array.from(buckets.entries()));

//     var blob = new Blob([json], {type: 'text/json'}),
//         e    = document.createEvent('MouseEvents'),
//         a    = document.createElement('a')

//     a.download = filename
//     a.href = window.URL.createObjectURL(blob)
//     a.dataset.downloadurl =  ['text/json', a.download, a.href].join(':')
//     e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
//     a.dispatchEvent(e)
// }

export function loadPhilList() {
    loadWordList("Phil", "http://localhost/phil_wordlist.txt", parsePhilWordlist).then((wordList) => {
        Globals.wordList = wordList;
        console.log("Word List loaded");
        //saveBucketsToFile(wordList.buckets, "phil_wordlist_indexed.txt");
    });
}

function parsePhilWordlist(lines: string[]): Entry[] {
    return lines.filter(x => x.match(/^[A-Z]/)).map(x => {
      return {
        entry: x.trim(),
        qualityClass: QualityClass.Normal,
      };
    });
  }

export async function loadWordList(source: string, url: string, parserFunc: (lines: string[]) => Entry[]): Promise<IndexedWordList> {
    var startTime = new Date().getTime();
    var response = await fetch(url);
    var t2 = new Date().getTime();
    console.log(t2 - startTime);
    const lines = (await response.text()).split('\n');
    var t3 = new Date().getTime();
    console.log(t3 - startTime);
    var entries = parserFunc(lines);
    var t4 = new Date().getTime();
    console.log(t4 - startTime);
    var ret = {
        source: source,
        buckets: indexWordList(entries),
    }
    var t5 = new Date().getTime();
    console.log(t5 - startTime);

    return ret;
}

export async function loadIndexedWordList(url: string): Promise<IndexedWordList> {
    var response = await fetch(url);
    return await response.json();
}

export function wordListLookup(wordList: IndexedWordList, length: number, pos1: number, char1: string, pos2?: number, char2?: string): Entry[] {
    return wordList.buckets.get(`${length},${pos1},${char1}` + pos2 ? `,${pos2},${char2}` : '') || [];
}

function indexWordList(list: Entry[]): Map<string, Entry[]> {
    var dict = new Map<string, Entry[]>();

    for (let length = 2; length <= 15; length++) {
        for (let pos1 = 1; pos1 <= length; pos1++) {
            for (let ch1 = 65; ch1 <= 90; ch1++) {
                dict.set(`${length},${pos1},${String.fromCharCode(ch1)}`, []);
            }
        }
    }

    for (let length = 2; length <= 15; length++) {
        for (let pos1 = 1; pos1 <= length-1; pos1++) {
            for (let pos2 = pos1+1; pos2 <= length; pos2++) {
                for (let ch1 = 65; ch1 <= 90; ch1++) {
                    let ch1s = String.fromCharCode(ch1);
                    for (let ch2 = 65; ch2 <= 90; ch2++) {
                        dict.set(`${length},${pos1},${ch1s},${pos2},${String.fromCharCode(ch2)}`, []);
                    }
                }
            }
        }
    }

    list.forEach(entry => {
        let word = entry.entry;

        // 1-position entries
        for (let pos1 = 1; pos1 <= word.length; pos1++) {
            let key = `${word.length},${pos1},${word[pos1-1]}`;
            let newValue = dict.get(key) || [];
            newValue.push(entry);
            dict.set(key, newValue);
        }

        // 2-position entries
        for (let pos1 = 1; pos1 < word.length; pos1++) {
            for (let pos2 = pos1 + 1; pos2 <= word.length; pos2++) {
                let key = `${word.length},${pos1},${word[pos1-1]},${pos2},${word[pos2-1]}`;
                let newValue = dict.get(key) || [];
                newValue.push(entry);
                dict.set(key, newValue);
            }
        }
    });

    return dict;
}

