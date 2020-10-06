import React from 'react';
import { ConstraintErrorType } from '../../models/ConstraintErrorType';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from './SquareProps';

function Square(props: SquareProps) {
    return getSquareElement(props);
}

function getSquareElement(props: SquareProps) {
    if (props.type === SquareType.White) {
        return <div 
                    className={"grid-square" + (props.isSelected ? " grid-square-selected" : 
                        props.isInSelectedWord ? " grid-square-selected-word" : "") +
                        (props.constraintError === ConstraintErrorType.Word ? " grid-square-error-word" : 
                        props.constraintError === ConstraintErrorType.Crossing ? " grid-square-error-crossing" : 
                        props.fillContent ? "" :
                        between(props.constraintSum, 1, 1) ? " grid-square-constrained-5" : 
                        between(props.constraintSum, 1, 3) ? " grid-square-constrained-4" : 
                        between(props.constraintSum, 1, 10) ? " grid-square-constrained-3" : 
                        between(props.constraintSum, 1, 30) ? " grid-square-constrained-2" : 
                        between(props.constraintSum, 1, 100) ? " grid-square-constrained-1" : ""
                        )} 
                    data-row={props.row} data-col={props.col}>
            <div className="grid-number">{props.number ?? ""}</div>
            <div className={"grid-content" + (props.correctContent ? " grid-content-correct" : "")}>
                    {props.correctContent ? props.correctContent : props.fillContent || ""}
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