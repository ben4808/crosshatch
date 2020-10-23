import React from 'react';
import Grid from '../Grid/Grid';
import "./RightPanel.scss";
import { RightPanelProps } from './RightPanelProps';

function RightPanel(props: RightPanelProps) {
    return (
        <div id="RightPanel">
            <Grid height={7} width={7}></Grid>
        </div>
    );
}

export default RightPanel;