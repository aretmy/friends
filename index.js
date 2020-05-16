const parser = require('node-html-parser');
const fs = require('fs');
const natural = require('natural');
const NGrams = natural.NGrams;
const tokenizer = new natural.WordTokenizer;
const HtmlEntities = require('html-entities').XmlEntities;
const htmlEntities = new HtmlEntities();
function decode(text) {
    return htmlEntities.decode(text).replace('&nbsp;', ' ');
}
const stopwords = [
    'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'another',
    'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
    'between', 'both', 'but', 'by', 'came', 'can', 'cannot', 'come', 'could', 'did',
    'do', 'does', 'doing', 'during', 'each', 'few', 'for', 'from', 'further', 'get',
    'got', 'has', 'had', 'he', 'have', 'her', 'here', 'him', 'himself', 'his', 'how',
    'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'like', 'make', 'many', 'me',
    'might', 'more', 'most', 'much', 'must', 'my', 'myself', 'never', 'now', 'of', 'on',
    'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'said', 'same', 'see', 'should', 'since', 'so', 'some', 'still', 'such', 'take', 'than',
    'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
    'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
    'way', 'we', 'well', 'were', 'what', 'where', 'when', 'which', 'while', 'who',
    'whom', 'with', 'would', 'why', 'you', 'your', 'yours', 'yourself',
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
    'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '$', '1',
    '2', '3', '4', '5', '6', '7', '8', '9', '0', '_'];

const beautify = require('json-beautify');

function parseEpisodes() {
    const files = fs.readdirSync('./season');

    const episodes = [];
    for (const file of files) {
        const match = file.match(/^(\d{2})(\d{2})?(?:-?(\d{2})(\d{2}))?\.html$/);
        if (!match) {
            // console.log('no match', file);
            continue;
        }

        episodes.push({
            season: parseInt(match[1], 10),
            episode: parseInt(match[2], 10) + (match[4] ? '-' + match[4] : 0),
            filename: './season/' + file,
        });
    }

    let sceneId = 0;
    let lineId = 0;
    for (const episode of episodes) {
        // if (episode.season !== 3 || episode.episode !== 15) {
        //     continue;
        // }

        const content = fs.readFileSync(episode.filename);

        const parsed = parser.parse(content.toString('utf8'), {lowerCaseTagName: true});
        const text = parsed.rawText;

        const preRows = text.split('\n').map(s => s.trim()).filter(Boolean);
        if (preRows[0].match(/DOCTYPE/)) {
            preRows.shift();
        }

        fs.writeFileSync(episode.filename.replace('.html', '.txt'), preRows.join('\n'));

        let titleelem = parsed.querySelector('title');
        const title = titleelem ? titleelem.text : '';
        episode.name = [title, ...preRows.slice(0, 5)].find(s => s.match(/(The.*One|TOW)/i));

        const scenes = [];
        let currentScene = null;
        let currentLine = null;

        const rows = preRows.reduce((acc, row) => {
            const match = null; //row.match(/^(\[.*?])(.*)$/);
             if (match) {
                 console.log(row);
                 acc.push(match[1], match[2])
             } else {
                 acc.push(row);
             }

             return acc;
        }, []);

        for (let i in rows) {
            let row = decode(rows[i]);

            if (!row.trim().length) {
                continue;
            }

            let match = null;

            match = row.match(/^Written by: (.*)$/);
            if (match) {
                episode.writtenBy = match[1];
                continue;
            }

            match = row.match(/^\[Scene:\s?(.*?)]?$/);
            if (match) {
                // console.log('Scene', match[1]);
                if (currentScene) {
                    delete currentScene.currentLine;
                    delete currentScene.nameClosed;
                    currentLine = null;
                }

                currentScene = {
                    id: ++sceneId,
                    name: match[1],
                    currentLine: null,
                    lines: [],
                    nameClosed: row.indexOf(']') > -1,
                };
                scenes.push(currentScene);

                continue;
            }

            if (!currentScene) {
                continue;
            }

            if (!currentScene.nameClosed) {
                match = row.match(/^(.*?)]?$/);
                if (match) {
                    // console.log('Scene add', match[1]);
                    currentScene.name += ' ' + match[1];
                    currentScene.nameClosed = row.indexOf(']') > -1;
                }

                continue;
            }

            match = row.match(/^([\(\[]([^\)\]]+))$/);
            if (match && row.indexOf(/[\]\)]/) === -1) {
                currentLine = {
                    cut: match[1],
                    isClosed: row.indexOf(']') > -1,
                };
                currentScene.lines.push(currentLine);

                if (currentLine.isClosed) {
                    delete currentLine.isClosed;
                    currentLine = null;
                }

                continue;
            }

            match = row.match(/^(.*])$/);
            if (match && currentLine && currentLine.cut && !currentLine.cut.isClosed) {
                currentLine.cut += match[1];
                currentLine.isClosed = row.indexOf(']') > -1;
                continue;
            }

            match = row.match(/^(?:([0-9A-Z].*): )?(.*)$/);
            if (match && match[1]) {
                currentLine = {
                    id: ++lineId,
                    character: match[1],
                    line: match[2],
                };

                currentScene.currentLine = currentLine;
                currentScene.lines.push(currentLine);
            } else if (currentLine && match && !match[1]) {
                if (currentLine.cut) {
                    currentLine.cut += ' ' + match[2];
                } else {
                    currentLine.line += ' ' + match[2];
                }
            } else if (row.match(/^\(.*\)$/)) {
                currentLine = {
                    cut: row,
                };
                currentScene.lines.push(currentLine);
            } else if (row.trim() === 'End') {
                console.log('End');
            } else {
                console.log('Problem with line', JSON.stringify({
                    season: episode.season,
                    episode: episode.episode,
                    i, row, match,
                    currentLine
                }));

                break;
            }
        }

        episode.scenes = scenes;

        // console.log(episode);
    }

    return episodes;
}

const episodes = parseEpisodes();
// console.log(episodes);
fs.writeFileSync('./result.json', beautify(episodes, null, 2, 80));

// const episodes = require('./result.json');
toCsv(episodes);

function toUpperCaseFirst(character) {
    return character.slice(0, 1).toUpperCase() + character.slice(1).toLowerCase();
}

function toLowerCaseFirstLetters(character) {
    character.split(' ').map(part => toUpperCaseFirst(part)).join(' ');
}

function cleanMr(character) {
    let match = character.match(/(Mrs?) (.*)/)
    if (match) {
        return match[1] + '. ' + match[2].trim();
    }

    return character;
}

function normalizeCharacter(character) {
    character = removeCuts(character);

    switch (character) {
        case 'MNCA':
            return 'Monica';
        case 'RACH':
            return 'Rachel';
        case 'PHOE':
            return 'Phoebe';
        case 'CHAN':
            return 'Chandler';
        case 'ESTL':
            return 'Estel';
        case 'MR. GREENE':
            return 'Mr. Green';
    }

    if (character.match(/^[\. A-Z]+$/)) {
        return cleanMr(toLowerCaseFirstLetters(character));
    }

    return cleanMr(character);
}


function removeCuts(string) {
    return string.replace(':', '')
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?]/g, '')
        .trim();
}

function toCsv(episodes) {
    const csvStringifier = require('csv-stringify')({
        delimiter: '|',
        quoted: true,
    });

    csvStringifier.pipe(fs.createWriteStream(`./data.csv`, {
        flags: 'a'
    }));

    for (const episode of episodes) {
        for (const scene of episode.scenes) {
            for (const line of scene.lines) {
                if (line.cut) {
                    continue;
                }

                const lineWithoutParenthesis = removeCuts(line);
                if (!lineWithoutParenthesis.length) {
                    continue;
                }

                const words = tokenizer.tokenize(lineWithoutParenthesis);

                const common = {
                    season: episode.season,
                    episode: episode.episode,
                    episodeId: episode.season + ' ' + episode.episode,
                    sceneId: scene.id,
                    scene: scene.name,
                    character: normalizeCharacter(line.character),
                    lineId: line.id,
                    line: line.line,
                };

                if (!words.length) {
                    console.log('No words for line', line.line);

                    csvStringifier.write({
                        ...common,
                        word: '',
                        isStopword: true,
                        gram: 1,
                    });

                    continue;
                }

                for (const word of words) {
                    csvStringifier.write({
                        ...common,
                        word: word,
                        isStopword: !!(stopwords.indexOf(word.toLowerCase()) > -1 || word.match(/^\d+/)) ? 1 : 0,
                        gram: 1,
                    });
                }


                const ngrams = [
                    { n: 2, ngrams: NGrams.ngrams(words.join(' '), 2) },
                    { n: 3, ngrams: NGrams.ngrams(words.join(' '), 3) },
                ];

                for (const ngram of ngrams) {
                    for (gram of ngram.ngrams) {
                        csvStringifier.write({
                            ...common,
                            word: gram.join(' '),
                            isStopword: 0,
                            gram: ngram.n,
                        });
                    }
                }
            }
        }
    }
}



// fs.writeFileSync('./result.json', JSON.stringify(episodes[0].scenes[0]));
// console.log(episodes[0].scenes[0]);