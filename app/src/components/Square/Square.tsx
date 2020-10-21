import React from 'react';
import { QualityClass } from '../../models/QualityClass';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from './SquareProps';

function Square(props: SquareProps) {
    return getSquareElement(props);
}

function getSquareElement(props: SquareProps) {
    if (props.type === SquareType.White) {
        return <div 
                    className={"grid-square" + 
                        (props.isSelected ? " grid-square-selected" : props.isInSelectedWord ? " grid-square-selected-word" : "") +
                        (props.fillContent ? "" :
                        between(props.constraintSum, 1, 1) ? " grid-square-constrained-5" : 
                        between(props.constraintSum, 1, 3) ? " grid-square-constrained-4" : 
                        between(props.constraintSum, 1, 10) ? " grid-square-constrained-3" : 
                        between(props.constraintSum, 1, 30) ? " grid-square-constrained-2" : 
                        between(props.constraintSum, 1, 100) ? " grid-square-constrained-1" : ""
                        )} 
                    data-row={props.row} data-col={props.col}>
            <div className="grid-number">{props.number ?? ""}</div>
            <div className={"grid-content" + 
                        (props.chosenFillContent ? " grid-content-chosen-fill" : 
                         props.qualityClass === QualityClass.Lively ? " grid-content-lively" :
                         props.qualityClass === QualityClass.Normal ? " grid-content-normal" :
                         props.qualityClass === QualityClass.Crosswordese ? " grid-content-crosswordese" :
                         props.qualityClass === QualityClass.Iffy ? " grid-content-iffy" :
                         props.qualityClass === QualityClass.NotAThing ? " grid-content-notathing" : ""
                        )}>
                    {props.userContent ? props.userContent : props.chosenFillContent ? props.chosenFillContent : props.fillContent || ""}
            </div>
        </div>
    }
    else {
        return <div className={"grid-square-black" + (props.isSelected ? " grid-square-black-selected" : "")} 
            data-row={props.row} data-col={props.col}>
        </div>
    }
}

function between(input: number, min: number, max: number): boolean {
    return input >= min && input <= max;
}

export default Square;