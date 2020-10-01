import React from 'react';
import "./Menu.scss";
import { MenuProps } from './MenuProps';
import Globals from '../../lib/windowService';

function Menu(props: MenuProps) {
    function handleFillClick() {
        if (Globals.fillHandler) {
            Globals.fillHandler();
        }
    }

    return (
        <div id="Menu" className="menu-container">
            <button className="btn btn-primary" onClick={handleFillClick}>Fill</button>
        </div>
    );
}

export default Menu;