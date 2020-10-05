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
                    className={"grid-square" + (props.isSelected ? " grid-square-selected" : props.isInSelectedWord ? " grid-square-selected-word" : 
                        props.constraintError === ConstraintErrorType.Word ? " grid-square-error-word" : 
                        props.constraintError === ConstraintErrorType.Crossing ? " grid-square-error-crossing" : "")} 
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

export default Square;