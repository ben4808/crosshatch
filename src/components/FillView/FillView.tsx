import React, { useContext, useRef, useState } from 'react';
import { SymmetryType } from '../../models/SymmetryType';
import "./FillView.scss";
import Globals from '../../lib/windowService';
import { FillStatus } from '../../models/FillStatus';
import { getEntryAtWordKey, getGrid, getSection, mapKeys, mapValues } from '../../lib/util';
import { calculateSectionOrder, entriesFromSectionString, entryFromSectionString, getLongestStackWord, getPhoneticName, insertSectionCandidateIntoGrid, 
    makeNewSection, updateSectionFilters } from '../../lib/section';
import { clearFill, eraseSectionCandidateFromGrid, insertEntryIntoGrid, updateGridConstraintInfo, updateManualEntryCandidates } from '../../lib/grid';
import { fillSectionWord, makeNewNode } from '../../lib/fill';
import { ensureWordList, terminateFillWorkers } from '../../lib/fillWorkerPool';
import { cancelGettableFill, startGettableFill } from '../../lib/gettableFill';
import { cancelMagicPuzzle, runMagicPuzzle } from '../../lib/magicPuzzle';
import { FillNode } from '../../models/FillNode';
import { AppContext } from '../../AppContext';
import { ContentType } from '../../models/ContentType';
import { GridState } from '../../models/GridState';
import { Section } from '../../models/Section';
import { processWordListData } from '../../lib/wordList';
import { SectionCandidate } from '../../models/SectionCandidate';
import ClassifyModal from './ClassifyModal';
import { GETTABLE_VERY } from '../../lib/crosswordListRatings';

/** Refresh fills list promptly while searching; throttle only to avoid per-fill thrash. */
const FILL_COUNT_UI_INTERVAL_MS = 100;

function countVeryGettableEntries(section: Section, sc: SectionCandidate): number {
    const grid = getGrid();
    let count = 0;
    section.words.forEach((_, key) => {
        const word = grid.words.get(key);
        if (!word) return;
        const entry = entryFromSectionString(section, sc.sectionString, word);
        if (!entry || /[^A-Z]/.test(entry)) return;
        if (Globals.wordGettable?.get(entry) === GETTABLE_VERY) count++;
    });
    return count;
}

function FillView() {
    const appContext = useContext(AppContext);
    const [showSectionCandidates, setShowSectionCandidates] = useState(true);
    const [isWordListLoading, setIsWordListLoading] = useState(false);
    const [fillMode, setFillMode] = useState<"fill" | "genKnowledge" | "allEntries" | undefined>(undefined);
    const [isMagicRunning, setIsMagicRunning] = useState(false);
    const [magicStatus, setMagicStatus] = useState("");
    const [classifyFillWords, setClassifyFillWords] = useState<string[] | undefined>(undefined);
    const fillUiLastUpdateRef = useRef(0);

    function triggerUpdate() {
        appContext.triggerUpdate();
    }

    function setFillStatus(newStatus: FillStatus) {
        Globals.fillStatus = newStatus;
        triggerUpdate();
    }

    function stopFillMode() {
        cancelGettableFill();
        clearFill(getGrid());
        setFillStatus(FillStatus.Ready);
        setFillMode(undefined);
        triggerUpdate();
    }

    function startFillSearch(mode: "fill" | "genKnowledge" | "allEntries") {
        // Fresh search each run; leave previously found fills unless user clears them.
        fillUiLastUpdateRef.current = 0;
        const result = startGettableFill({
            onProgress: () => {
                const now = performance.now();
                if (now - fillUiLastUpdateRef.current >= FILL_COUNT_UI_INTERVAL_MS) {
                    fillUiLastUpdateRef.current = now;
                    appContext.triggerUpdate();
                }
            },
            onComplete: () => {
                setFillMode(undefined);
                appContext.triggerUpdate();
            },
        }, { mode });

        if (result === "nothingToFill") {
            window.alert("There are no open entries to fill.");
            return;
        }
        setFillMode(mode);
        triggerUpdate();
    }

    function handleToggleFill() {
        if (fillMode === "fill") {
            stopFillMode();
            return;
        }
        startFillSearch("fill");
    }

    function handleToggleGenKnowledge() {
        if (fillMode === "genKnowledge") {
            stopFillMode();
            return;
        }
        startFillSearch("genKnowledge");
    }

    function handleToggleAllEntries() {
        if (fillMode === "allEntries") {
            stopFillMode();
            return;
        }
        startFillSearch("allEntries");
    }

    function handleToggleMagicPuzzle() {
        if (isMagicRunning) {
            cancelMagicPuzzle();
            return;
        }

        fillUiLastUpdateRef.current = 0;
        setIsMagicRunning(true);
        setMagicStatus("Starting…");
        runMagicPuzzle({
            onStatus: status => setMagicStatus(status),
            onProgress: () => {
                const now = performance.now();
                if (now - fillUiLastUpdateRef.current >= FILL_COUNT_UI_INTERVAL_MS) {
                    fillUiLastUpdateRef.current = now;
                    appContext.triggerUpdate();
                }
            },
            onGridChanged: () => appContext.triggerUpdate(),
        }).then(result => {
            setIsMagicRunning(false);
            if (!result.success && result.cancelled) setMagicStatus("Cancelled.");
            appContext.triggerUpdate();
        });
    }

    function handleFillWordClick(event: any) {
        if (!Globals.wordList) return;

        if (!fillSectionWord()) {
            clearFill(getGrid());
            setFillStatus(FillStatus.Complete);
        }
        triggerUpdate();
    }

    function handleSymmetryChange(event: any) {
        Globals.gridSymmetry = +SymmetryType[event.target[event.target.selectedIndex].value] as SymmetryType;
    }

    function getSymmetryTypeString(type: string): string {
        switch(type) {
            case "None": return "None";
            case "Rotate180": return "180° Rotational";
            case "Rotate90": return "90° Rotational";
            case "MirrorHorizontal": return "Mirror Horizontally";
            case "MirrorVertical": return "Mirror Vertically";
            case "MirrorNWSE": return "Mirror NW to SE";
            case "MirrorNESW": return "Mirror NE to SW";
        }
        return "";
    }

    function getSymmetryTypesForRectGrids(): string[] {
        return ["None", "Rotate180", "MirrorHorizontal", "MirrorVertical"];
    }

    function getFillStatusString(status: FillStatus): string {
        switch(status) {
            case FillStatus.NoWordList: return "No Word List Loaded";
            case FillStatus.Ready: return "Ready to Fill";
            case FillStatus.Running: return "Fill Running...";
            case FillStatus.Complete: return "Fill Complete";
            default: return "";
        }
    }

    function getManualEntryNode(entry: string, isHover?: boolean): FillNode {
        let node = Globals.selectedWordNode!;
        let wordKey = Globals.selectedWordKey!;
        insertEntryIntoGrid(node, wordKey, entry, isHover ? ContentType.HoverChosenWord : ContentType.ChosenWord);
        return node;
    }

    function getManualSectionNode(sectionCandidateKey: string, isHover: boolean): FillNode {
        let grid = getGrid();

        let section = getSection();
        let candidate = section.candidates.get(sectionCandidateKey)!;
        if (!candidate) {
            let node = makeNewNode(grid, 0);
            return node;
        }

        let node = makeNewNode(grid, 0);
        insertSectionCandidateIntoGrid(node.endGrid, candidate, 
            isHover ? ContentType.HoverChosenSection : ContentType.ChosenSection);
        return node;
    }

    function handleEntryCandidateClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        if (!Globals.selectedWordKey) return;

        let entry = target.attributes["data-word"].value as string;
        let node = getManualEntryNode(entry, false);

        updateManualEntryCandidates(node.endGrid);

        Globals.activeGrid = node.endGrid;
        updateSectionFilters();
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleEntryCandidateHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        if (!Globals.selectedWordKey) return;

        let entry = target.attributes["data-word"].value as string;
        let node = getManualEntryNode(entry, true);

        Globals.hoverGrid = node.endGrid;
        triggerUpdate();
    }

    function handleEntryCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleSectionClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            if (target.classList[0] === "section-checkbox") return;
            target = target.parentElement;
            if (!target) return;
        }

        let sectionId = +target.attributes["data-id"].value;
        clearFill(getGrid());

        if (sectionId === Globals.activeSectionId!) {
            Globals.activeSectionId = 0;
            Globals.selectedSectionIds = new Map<number, boolean>();
            Globals.selectedSectionIds!.set(sectionId, true);
        }
        else {
            Globals.activeSectionId = sectionId;
            Globals.selectedSectionIds = new Map<number, boolean>();
            Globals.selectedSectionIds!.set(sectionId, true);
        }

        Globals.hoverGrid = undefined;
        Globals.hoverSectionId = undefined;
        triggerUpdate();
    }

    function handleSectionCheckClick(event: any) {
        return;
        // let target = event.target;
        // while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
        //     target = target.parentElement;
        //     if (!target) return;
        // }

        // let sectionId = +target.attributes["data-id"].value;
        // if (Globals.selectedSectionIds!.get(sectionId))
        //     Globals.selectedSectionIds!.delete(sectionId);
        // else
        //     Globals.selectedSectionIds!.set(sectionId, true);
    }

    function handleSectionHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let sectionId = +target.attributes["data-id"].value;
        Globals.hoverSectionId = sectionId;
        triggerUpdate();
    }

    function handleSectionBlur() {
        Globals.hoverSectionId = undefined;
        triggerUpdate();
    }

    function eraseSelectedFillFromGrid(section: Section, grid: GridState, candidateKey: string) {
        section.selectedCandidate = undefined;
        let sc = section.candidates.get(candidateKey);
        if (!sc) return;
        eraseSectionCandidateFromGrid(grid, sc);
        clearFill(grid);
    }

    function handleSectionCandidateClick(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let section = getSection();
        let grid = getGrid();
        let candidateKey = target.attributes["data-candidate-key"].value as string;

        if (section.selectedCandidate === candidateKey) {
            eraseSelectedFillFromGrid(section, grid, candidateKey);
        }
        else {
            if (section.selectedCandidate) {
                eraseSelectedFillFromGrid(section, grid, section.selectedCandidate);
            }

            let node = getManualSectionNode(candidateKey, false);
            Globals.selectedSectionCandidateKeys!.set(section.id, candidateKey);
            section.selectedCandidate = candidateKey;

            updateManualEntryCandidates(node.endGrid);
            Globals.activeGrid = node.endGrid;
        }
        
        updateSectionFilters();
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleSectionCandidateHover(event: any) {
        let target = event.target;
        while (target.classList.length < 1 || target.classList[0] !== "fill-list-row-wrapper") {
            target = target.parentElement;
            if (!target) return;
        }

        let candidateKey = target.attributes["data-candidate-key"].value as string;
        let node = getManualSectionNode(candidateKey, true);

        Globals.hoverGrid = node.endGrid;
        triggerUpdate();
    }

    function handleShowSectionCandidatesToggle() {
        setShowSectionCandidates(!showSectionCandidates);
    }

    function handleClassifyClick(event: any) {
        event.preventDefault();
        event.stopPropagation();
        let section = getSection();
        if (!section.selectedCandidate) return;
        setClassifyFillWords(entriesFromSectionString(section, section.selectedCandidate));
    }

    function clearSectionCandidates() {
        if (!window.confirm("Are you sure you want to clear the fills?")) return;

        let section = getSection();
        let grid = getGrid();
        if (section.selectedCandidate) {
            eraseSelectedFillFromGrid(section, grid, section.selectedCandidate);
        }
        section.candidates = new Map<string, SectionCandidate>();
        section.selectedCandidate = undefined;
        updateSectionFilters();
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function handleUseHeuristicsToggle() {
        let newValue = Globals.useManualHeuristics !== undefined ? !Globals.useManualHeuristics! : false;
        Globals.useManualHeuristics = newValue;

        triggerUpdate();
        let node = Globals.selectedWordNode;
        if (!node) return;

        updateManualEntryCandidates(grid);
    }

    function handleSectionCandidateBlur() {
        Globals.hoverGrid = undefined;
        triggerUpdate();
    }

    function loadWordList() {
        document.getElementById("open-wordlist-input")!.click();
    }

    function clearWordLists() {
        if (!window.confirm("Are you sure you want to clear the word lists?")) return;

        cancelGettableFill();
        cancelMagicPuzzle();
        terminateFillWorkers();
        setFillMode(undefined);
        Globals.wordList = undefined;
        Globals.wordLists = [];
        Globals.knownWords = new Set<string>();
        Globals.wordGettable = undefined;
        Globals.wordDesirability = undefined;
        Globals.wordAbbr = undefined;
        Globals.wordSensitive = undefined;
        Globals.wordCrosswordese = undefined;
        Globals.likelyGettableSet = undefined;
        ensureWordList(undefined, undefined);
        setFillStatus(FillStatus.NoWordList);
        Globals.selectedWordNode = undefined;
    }

    function onWordListUpload(event: any) {
        let file = event.target.files[0];
        event.target.value = null;
        setIsWordListLoading(true);

        setTimeout(() => {
            processWordListData(file.name, file).then(wordList => {
                if (wordList) {
                    Globals.wordLists!.push(wordList);
                    ensureWordList(Globals.wordList, Globals.knownWords);
                    setFillStatus(FillStatus.Ready);
                    let grid = getGrid();
                    updateGridConstraintInfo(grid);
                    updateManualEntryCandidates(grid);
                    setIsWordListLoading(false);
                    triggerUpdate();
                }
            });
        }, 5);
    }

    let grid = getGrid();
    let selectedSymmetry = SymmetryType[Globals.gridSymmetry!];
    let symmetryOptions = (!grid || grid.width === grid.height) ?
        Object.values(SymmetryType).filter(t => isNaN(Number(t))) :
        getSymmetryTypesForRectGrids();

    const isFillRunning = fillMode === "fill";
    const isGenKnowledgeRunning = fillMode === "genKnowledge";
    const isAllEntriesRunning = fillMode === "allEntries";
    const fillQuotaCount = Globals.fillFilter?.maxLikelyGettable ?? 0;
    let fillStatusStr = getFillStatusString(Globals.fillStatus!);
    
    let wordLists = Globals.wordLists || [];

    let entryCandidates = Globals.selectedWordNode ? Globals.selectedWordNode.entryCandidates : [];
    let isNoEntryCandidates = Globals.selectedWordNode && entryCandidates.length === 0;

    let sections = [] as Section[];
    if (Globals.sections!) {
        let sectionsOrder = calculateSectionOrder(mapValues(Globals.sections!));
        sections = sectionsOrder.map(id => Globals.sections!.get(id)!);
    }
    let activeSection = Globals.sections ? Globals.sections!.get(Globals.activeSectionId!)! : makeNewSection(-1);
    let selectedScKey = activeSection.selectedCandidate;
    let selectedSectionIds = mapKeys(Globals.selectedSectionIds!) || [0];
    const gettableCounts = new Map<string, number>();
    let sectionCandidates = mapValues(activeSection.candidates)
        .filter(sc => !sc.isFilteredOut);
    sectionCandidates.forEach(sc => gettableCounts.set(sc.sectionString, countVeryGettableEntries(activeSection, sc)));
    sectionCandidates.sort((a, b) =>
        (gettableCounts.get(b.sectionString)! - gettableCounts.get(a.sectionString)!) || b.score - a.score);
    let selectedEntry = Globals.selectedWordKey ? getEntryAtWordKey(grid, Globals.selectedWordKey!) : "";
    let useManualHeuristics = Globals.useManualHeuristics !== undefined ? Globals.useManualHeuristics : true;

    let wordListsStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

    let entryCandidatesStyle = {
        gridTemplateColumns: `4fr 1fr`
    } as React.CSSProperties;

    let sectionsStyle = {
        gridTemplateColumns: `1fr 2fr 1fr 1fr 1fr`
    } as React.CSSProperties;

    let fillsStyle = {
        gridTemplateColumns: `3fr 1fr 1fr`
    } as React.CSSProperties;

    return (
        <div id="FillView" className="fill-container">
            <input id="open-wordlist-input" className="d-none" type="file" accept=".csv" onChange={onWordListUpload} />
            <div id="loader" style={{display: isWordListLoading ? "block" : "none"}}></div>

            <div className={"fill-status" +
                (Globals.fillStatus! === FillStatus.NoWordList ? " fill-status-red" :
                Globals.fillStatus! === FillStatus.Running ? " fill-status-green" : "")}>{fillStatusStr}</div>
            {wordLists.length > 0 &&
            <>
                <div className="fill-options-heading">Modes</div>
                <div className="form-check form-switch fill-switch">
                    <input type="checkbox" className="form-check-input" id="fillSwitch" 
                        checked={isFillRunning} disabled={isMagicRunning || isGenKnowledgeRunning || isAllEntriesRunning} onChange={handleToggleFill} />
                    <label className="form-check-label" htmlFor="fillSwitch">Fill</label>
                </div>
                {isFillRunning && (
                    <div className="fill-mode-status">Considering {fillQuotaCount} Likely Gettable</div>
                )}
                <div className="form-check form-switch fill-switch fill-mode-option">
                    <input type="checkbox" className="form-check-input" id="genKnowledgeSwitch"
                        checked={isGenKnowledgeRunning} disabled={isMagicRunning || isFillRunning || isAllEntriesRunning} onChange={handleToggleGenKnowledge} />
                    <label className="form-check-label" htmlFor="genKnowledgeSwitch">Gen. Knowledge</label>
                </div>
                {isGenKnowledgeRunning && (
                    <div className="fill-mode-status">Considering {fillQuotaCount} Maybe Gettable</div>
                )}
                <div className="form-check form-switch fill-switch fill-mode-option">
                    <input type="checkbox" className="form-check-input" id="allEntriesSwitch"
                        checked={isAllEntriesRunning} disabled={isMagicRunning || isFillRunning || isGenKnowledgeRunning} onChange={handleToggleAllEntries} />
                    <label className="form-check-label" htmlFor="allEntriesSwitch">All Entries</label>
                </div>
                {isAllEntriesRunning && (
                    <div className="fill-mode-status">Considering all entries</div>
                )}
                <div className="form-check form-switch fill-switch fill-mode-option">
                    <input type="checkbox" className="form-check-input" id="magicPuzzleSwitch"
                        checked={isMagicRunning} disabled={isFillRunning || isGenKnowledgeRunning || isAllEntriesRunning} onChange={handleToggleMagicPuzzle} />
                    <label className="form-check-label" htmlFor="magicPuzzleSwitch">Magic Puzzle</label>
                </div>
                {magicStatus && <div className="magic-puzzle-status">{magicStatus}</div>}
                <br />
            </>
            }
            
            <br /><br />
            Grid Symmetry: <br />
            <select className="form-select symmetry-select" defaultValue={selectedSymmetry} onChange={handleSymmetryChange}>
                {symmetryOptions.map(type => (
                    <option value={type} key={type}>{getSymmetryTypeString(type.toString())}</option>
                ))}
            </select>
            <br /><br />
            <button className="btn btn-primary" onClick={handleFillWordClick} style={{display: "none"}}>Fill Word</button>

            <div className="fill-lists">
                <div className="fill-list-box">
                    <div className="fill-list-title">Word Lists</div>
                    <div className="fill-list-button" onClick={clearWordLists}>Clear</div>
                    <div className="fill-list-button" onClick={loadWordList}>Load</div>
                    <div className="fill-list" style={wordListsStyle}>
                        <div className="fill-list-header">Filename</div>
                        <div className="fill-list-header">Count</div>
                        { wordLists.length === 0 && (
                            <div className="fill-list-row-wrapper" style={{cursor: "auto"}}>
                                <div><i>No word lists loaded</i></div><div></div>
                            </div>
                        )}
                        { wordLists.map(wl => (
                            <div className="fill-list-row-wrapper" style={{cursor: "auto"}} key={wl.filename}>
                                <div>{wl.filename}</div>
                                <div>{wl.wordCount}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleEntryCandidateBlur}>
                    <div className="fill-list-title entry-color">Entry Candidates</div>
                    <div className="fill-sec-checkbox">
                        <input type="checkbox" className="section-checkbox" id="use-heuristics-box"
                                    checked={useManualHeuristics} onChange={handleUseHeuristicsToggle} />
                        <label htmlFor="use-heuristics-box">Use heuristics</label>
                    </div>
                    <div className="fill-list" style={entryCandidatesStyle}>
                        <div className="fill-list-header">Entry</div>
                        <div className="fill-list-header">Score</div>
                        { isNoEntryCandidates && useManualHeuristics && (
                            <div className="fill-list-row-wrapper">
                                <div><i>No viable entries</i></div><div></div>
                            </div>
                        )}
                        { entryCandidates.map(ec => (
                            <div className={"fill-list-row-wrapper" + (selectedEntry === ec.word ? " fill-list-row-selected" : "")} 
                                key={ec.word} data-word={ec.word}
                                onClick={handleEntryCandidateClick} onMouseOver={handleEntryCandidateHover}>
                                <div>{ec.word}</div>
                                <div>{ec.score.toFixed(0)}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionBlur}>
                    <div className="fill-list-title section-color">Sections</div>
                    <div className="fill-list" style={sectionsStyle}>
                        <div className="fill-list-header">Active</div>
                        <div className="fill-list-header">ID</div>
                        <div className="fill-list-header">Size</div>
                        <div className="fill-list-header">Conn</div>
                        <div className="fill-list-header">Fills</div>
                        { sections.map(sec => (
                            <div className={"fill-list-row-wrapper" + (sec.id === activeSection.id ? " fill-list-row-selected" : "")} 
                                key={sec.id} data-id={sec.id} onClick={handleSectionClick} onMouseOver={handleSectionHover}>
                                <div><input type="checkbox" className="section-checkbox"
                                    checked={selectedSectionIds.includes(sec.id)} onChange={handleSectionCheckClick} /></div>
                                <div>{getPhoneticName(sec.id)}</div>
                                <div>{sec.squares.size}</div>
                                <div>{sec.connections.size}</div>
                                <div>{sec.candidates.size}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="fill-list-box" onMouseOut={handleSectionCandidateBlur}>
                    <div className="fill-list-title">Fills {sectionCandidates.length > 0 ? `(${sectionCandidates.length})` : ""}</div>
                    <div className="fill-list-button" onClick={clearSectionCandidates}>Clear</div>
                    <div className="fill-sec-checkbox">
                        {selectedScKey && (
                            <button type="button" className="fill-classify-button" onClick={handleClassifyClick}>Classify</button>
                        )}
                        <input type="checkbox" className="section-checkbox" id="show-fills-box"
                                    checked={showSectionCandidates} onChange={handleShowSectionCandidatesToggle} />
                        <label htmlFor="show-fills-box">Show</label>
                    </div>
                    <div className="fill-list" style={fillsStyle}>
                        <div className="fill-list-header">Longest</div>
                        <div className="fill-list-header">Gettable</div>
                        <div className="fill-list-header">Score</div>
                        {!showSectionCandidates && (
                            <div className="fill-list-row-wrapper">
                                <div><i>Hidden</i></div><div></div><div></div>
                            </div>
                        )}
                        {showSectionCandidates && Globals.fillStatus === FillStatus.Complete && sectionCandidates.length === 0 && (
                            <div className="fill-list-row-wrapper">
                                <div><i>No fills found</i></div><div></div><div></div>
                            </div>
                        )}
                        {showSectionCandidates && sectionCandidates.map(sc => {
                            let entry = entryFromSectionString(activeSection, sc.sectionString, getLongestStackWord(activeSection));
                            let candidateKey = sc.sectionString;

                            return (
                            <div className={"fill-list-row-wrapper" + (selectedScKey === candidateKey ? " fill-list-row-selected" : "")}
                                key={candidateKey} data-candidate-key={candidateKey}
                                onClick={handleSectionCandidateClick} onMouseOver={handleSectionCandidateHover}>
                                <div>{entry}</div>
                                <div>{gettableCounts.get(candidateKey)}</div>
                                <div>{sc.score.toFixed(0)}</div>
                            </div>
                        )})}
                    </div>
                </div>
            </div>
            {classifyFillWords && (
                <ClassifyModal
                    fillWords={classifyFillWords}
                    onClose={() => setClassifyFillWords(undefined)}
                    onSaved={triggerUpdate}
                />
            )}
        </div>
    );
}

export default FillView;
