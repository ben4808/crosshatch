import React from 'react';
import { SquareType } from '../../models/SquareType';
import { SquareProps } from './SquareProps';

function Square(props: SquareProps) {
    return getSquareElement(props);
}

function getSquareElement(props: SquareProps) {
    if (props.type === SquareType.White) {
        return <div 
                    className={"grid-square" + (props.isSelected ? " grid-square-selected" : props.isInSelectedWord ? " grid-square-selected-word" : "")} 
                    data-row={props.row} data-col={props.col}>
            <div className="grid-number">{props.number ?? ""}</div>
            <div className="grid-content">{props.content ?? ""}</div>
        </div>
    }
    else {
        return <div className={"grid-square-black" + (props.isSelected ? " grid-square-black-selected" : "")} 
            data-row={props.row} data-col={props.col}>
        </div>
    }
}

export default Square;