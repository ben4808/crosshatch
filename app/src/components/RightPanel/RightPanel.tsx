import React from 'react';
import Grid from '../Grid/Grid';
import "./RightPanel.scss";
import { RightPanelProps } from './RightPanelProps';

function RightPanel(props: RightPanelProps) {
    return (
        <div id="RightPanel">
            <Grid height={5} width={5}></Grid>
        </div>
    );
}

export default RightPanel;