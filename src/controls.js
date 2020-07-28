import DrawConstants from '@mapbox/mapbox-gl-draw/src/constants';
import * as CommonSelectors from '@mapbox/mapbox-gl-draw/src/lib/common_selectors';
import length from '@turf/length';
import midpoint from '@turf/midpoint';
import { lineString } from '@turf/helpers';

import Constants from './constants';
import './common.css';
import './controls.css';

const DISTANCE_ABBRS = {
    'miles': 'mi',
    'kilometers': 'km'
};

const DEFAULT_CONTROL_POSITION = 'top-right';

class BaseInfoControl {

    constructor(options) {
        this.distanceUnits = options && options.distanceUnits || DEFAULT_DISTANCE_UNITS;
    }

    onAdd(map) {
        this._map = map;

        this._container = document.createElement('div');
        this._textContainer = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapbox-ctrl-feature-info mapboxgl-custom-control';
        this._container.appendChild(this._textContainer);
        this.clearFeatures();

        this.registerListeners();

        return this._container;
    }

    getDefaultPosition() {
        return DEFAULT_CONTROL_POSITION;
    }

    registerListeners() {
        this.onDrawCreateListener = this.onDrawCreate.bind(this);
        this.onDrawUpdateListener = this.onDrawUpdate.bind(this);
        this.onDrawSelectionChangeListener = this.onDrawSelectionChange.bind(this);
        this.onDrawDeleteListener = this.onDrawDelete.bind(this);

        this._map.on(DrawConstants.events.CREATE, this.onDrawCreateListener);
        this._map.on(DrawConstants.events.UPDATE, this.onDrawUpdateListener);
        this._map.on(DrawConstants.events.SELECTION_CHANGE, this.onDrawSelectionChangeListener);
        this._map.on(DrawConstants.events.DELETE, this.onDrawDeleteListener);
    }

    unregisterListeners() {
        this._map.off(DrawConstants.events.CREATE, this.onDrawCreateListener);
        this._map.off(DrawConstants.events.UPDATE, this.onDrawUpdateListener);
        this._map.off(DrawConstants.events.SELECTION_CHANGE, this.onDrawSelectionChangeListener);
        this._map.off(DrawConstants.events.DELETE, this.onDrawDeleteListener);
    }

    onDrawCreate(e) {
        if (this.isSupportedFeatures(e.features)) {
            this.clearFeatures();
            this.setFeatures(e.features);
        }
    }

    onDrawUpdate(e) {
        if (this.isSupportedFeatures(e.features) && e.action === DrawConstants.updateActions.CHANGE_COORDINATES) {
            this.clearFeatures();
            this.setFeatures(e.features);
        }
    }

    onDrawSelectionChange(e) {
        this.clearFeatures();
        if (this.isSupportedFeatures(e.features)) {
            this.setFeatures(e.features);
        }
    }

    onDrawDelete() {
        this.clearFeatures();
    }

    clearFeatures() {
        this._container.style.display = 'none';
        this.clearFeaturesText();
    }

    clearFeaturesText() {
        this._textContainer.innerHTML = '';
    }

    isSupportedFeatures() {
        throw new Error('Must implement isSupportedFeatures()');
    }

    getFeatureName(feature, state=null) {
        state = state || this._map.getFeatureState({id: feature.id, source: DrawConstants.sources.HOT});
        return state ? state.name : null;
    }

    setFeatures(features) {
        this._features = features;
    }

    onRemove() {
        this.unregisterListeners();
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }

}

class BaseEditableInfoControl extends BaseInfoControl {

    constructor(options) {
        super(options);
        this.drawControl = options && options.drawControl;
        this.editActions = [];
    }

    onAdd(map) {
        const container = super.onAdd(map);

        this._editContainer = document.createElement('div');
        this._editContainer.className = 'edit-ctrl';
        this._editContainer.innerHTML = '<div class="edit-tools">' +
            this.editToolbarHtml() + '</div>' +
            '<div class="edit-form"><label>Name: <input name="name"></label><div><button type="button" data-btn-action="ok">OK</button><button type="button" data-btn-action="cancel">Cancel</button></div></div>';
        this._container.appendChild(this._editContainer);

        this.registerDomEvents();
        return container;
    }

    editToolbarHtml() {
        return this.editActions.map((action) => `<a class="${action.className}" title="${action.title}"></a>`).join('');
    }

    registerDomEvents() {
        for (const action of this.editActions) {
            this._editContainer.querySelector(`.${action.className}`).addEventListener('click', action.handler.bind(this));
        }
        this._editContainer.querySelector('.edit-form button[data-btn-action=ok]').addEventListener('click', this.onClickOKEditButton.bind(this));
        this._editContainer.querySelector('.edit-form button[data-btn-action=cancel]').addEventListener('click', this.onClickCancelEditButton.bind(this));
        this._editContainer.querySelector('.edit-form input').addEventListener('keyup', this.onEditFormInputKeyup.bind(this));
    }

    onClickEditInfo(e) {
        e.preventDefault();
        this.displayEditForm();
    }

    displayEditForm() {
        this._editContainer.querySelector('.edit-form').style.display = 'block';
        this._editContainer.querySelector('.edit-tools').style.display = 'none';
        this._editContainer.querySelector('input').focus();
    }

    hideEditForm() {
        this._editContainer.querySelector('.edit-form').style.display = 'none';
        this._editContainer.querySelector('.edit-tools').style.display = 'flex';
    }

    saveEditForm() {
        const newName = this._editContainer.querySelector('input').value;
        this._map.setFeatureState({id: this._features[0].id, source: DrawConstants.sources.HOT},
            {name: newName});
        this.setFeaturesText(this._features, {name: newName});
    }

    onEditFormInputKeyup(e) {
        if (CommonSelectors.isEnterKey(e)) {
            this.saveEditForm();
            this.hideEditForm();
        } else if (CommonSelectors.isEscapeKey(e)) {
            this.hideEditForm();
        }
    }

    onClickOKEditButton() {
        this.saveEditForm();
        this.hideEditForm();
    }

    onClickCancelEditButton() {
        this.hideEditForm();
    }

    setFeatures(features) {
        super.setFeatures(features);
        this.hideEditForm();
    }

}

class LineStringInfoControl extends BaseEditableInfoControl {

    constructor(options) {
        super(options);
        this.distanceUnits = options && options.distanceUnits || 'kilometers';
        this.editActions = [{
            className: 'edit-info',
            title: 'Edit feature information',
            handler: this.onClickEditInfo
        }, {
            className: 'duplicate-feature',
            title: 'Duplicate feature',
            handler: this.onClickDuplicateFeature
        }, {
            className: 'add-feature-point',
            title: 'Add point to line',
            handler: this.onClickAddLinePoint
        }]);
    }

    registerListeners() {
        super.registerListeners();
        this.onDrawLineMouseMoveListener = this.onDrawLineMouseMove.bind(this);
        this._map.on(Constants.events.DRAW_MOUSE_MOVE, this.onDrawLineMouseMoveListener);
    }

    unregisterListeners() {
        super.unregisterListeners();
        this._map.off(Constants.events.DRAW_MOUSE_MOVE, this.onDrawLineMouseMoveListener);
    }

    onDrawLineMouseMove(e) {
        this.clearFeatures();
        this.setFeatures([e.feature], e.state);
    }

    onClickAddLinePoint(e) {
        e.preventDefault();
        const selected = this.drawControl.getSelected(), mode = this.drawControl.getMode();
        if (selected.features.length !== 1 || selected.features[0].geometry.type !== DrawConstants.geojsonTypes.LINE_STRING) {
            return;
        }
        const selectedLine = selected.features[0];
        if (mode === DrawConstants.modes.SIMPLE_SELECT) {
            this.extendLineString(selectedLine);
        } else if (mode === DrawConstants.modes.DIRECT_SELECT) {
            const selectedPoints = this.drawControl.getSelectedPoints();
            if (selectedPoints.features.length === 1) {
                const selectedPoint = selectedPoints.features[0];
                this.insertPointIntoLine(selectedLine, selectedPoint);
            }
        }

    }

    onClickDuplicateFeature(e) {
        e.preventDefault();
        const newLine = Object.assign({}, this._features[0]);
        delete newLine.id;
        const newFeatureIds = this.drawControl.add(newLine);
        this.drawControl.changeMode(
            DrawConstants.modes.SIMPLE_SELECT,
            { featureIds: newFeatureIds }
        );
        this.setFeatures(this.drawControl.getSelected().features);
    }

    onClickSplitLine(e) {
        e.preventDefault();
        const selected = this.drawControl.getSelected(), mode = this.drawControl.getMode();
        if (mode === DrawConstants.modes.DIRECT_SELECT) {
            const selectedPoints = this.drawControl.getSelectedPoints();
            if (selectedPoints.features.length === 1) {
                this.splitLine(selected.features[0], selectedPoints.features[0]);
            }
        }
    }

    extendLineString(fromFeature) {
        this.drawControl.changeMode(
            DrawConstants.modes.DRAW_LINE_STRING, {
            featureId: fromFeature.id,
            from: {
                type: DrawConstants.geojsonTypes.POINT,
                coordinates: fromFeature.geometry.coordinates[fromFeature.geometry.coordinates.length - 1]
            },
            showNamePrompt: false,
            featureName: fromFeature.properties.name
        });
    }

    findPointInLine(line, point) {
        return line.geometry.coordinates.findIndex(
            (latlng) => latlng.every((position, index) => position === point.geometry.coordinates[index])
        );
    }

    insertPointIntoLine(selectedLine, selectedPoint) {
        const pointIndex = this.findPointInLine(selectedLine, selectedPoint);
        if (pointIndex === selectedLine.geometry.coordinates.length - 1) {
            this.extendLineString(selectedLine);
        } else {
            const mid = midpoint(selectedLine.geometry.coordinates[pointIndex], selectedLine.geometry.coordinates[pointIndex + 1]);
            selectedLine.geometry.coordinates.splice(pointIndex + 1, 0, mid.geometry.coordinates);
            this.drawControl.add(selectedLine);
        }
    }

    isSupportedFeatures(features) {
        return features.length == 1 && features[0].geometry.type === DrawConstants.geojsonTypes.LINE_STRING;
    }

    setFeatures(features, state) {
        super.setFeatures(features);
        this.setFeaturesText(features, state);
        this._container.style.display = 'block';
        const lineString = features[0];
        this._editContainer.querySelector('input').value = this.getFeatureName(lineString, state) || '';
    }

    setFeaturesText(features, state) {
        const lineString = features[0];
        const lineName = this.getFeatureName(lineString, state);
        const unitName = DISTANCE_ABBRS[this.distanceUnits];
        const lineDistance = length(lineString, {units: this.distanceUnits});
        this._textContainer.textContent = (lineName || 'Untitled') + ': ' +
            lineDistance.toLocaleString() + ' ' + unitName;
    }
}

class PointInfoControl extends BaseEditableInfoControl {

    constructor(options) {
        super(options);
        this.distanceUnits = options && options.distanceUnits || 'kilometers';
        this.editActions = [{
            className: 'edit-info',
            title: 'Edit feature information',
            handler: this.onClickEditInfo
        }];
    }

    isSupportedFeatures(features) {
        return features.length == 1 && features[0].geometry.type === DrawConstants.geojsonTypes.POINT;
    }

    setFeatures(features, state) {
        super.setFeatures(features);
        this.setFeaturesText(features, state);
        this._container.style.display = 'block';
    }

    setFeaturesText(features, state) {
        const point = features[0];
        const pointName = this.getFeatureName(point, state);
        this._textContainer.textContent = pointName || 'Untitled';
    }

}

class MultiLineInfoControl extends BaseEditableInfoControl {

    constructor(options) {
        super(options);
        this.distanceUnits = options && options.distanceUnits || 'kilometers';
        this.editActions = [{
            className: 'join-lines',
            title: 'Join lines',
            handler: this.onClickJoinLines
        }];
    }

    orderFeaturesByDistanceToAnother() {
        const coordinates = this._features.map((feature) => feature.geometry.coordinates);
        const joiningDistances = [
            length(lineString([coordinates[0][coordinates[0].length - 1], coordinates[1][0]])),
            length(lineString([coordinates[1][coordinates[1].length - 1], coordinates[0][0]]))
        ];
        return (joiningDistances[0] <= joiningDistances[1] ?
            [ this._features[0], this._features[1] ] : [ this._features[1], this._features[0] ]);
    }

    onClickJoinLines(e) {
        e.preventDefault();
        const orderedFeatures = this.orderFeaturesByDistanceToAnother();
        const startingFeature = orderedFeatures[0];
        const removeFeature = orderedFeatures[1];
        startingFeature.geometry.coordinates = startingFeature.geometry.coordinates.concat(removeFeature.geometry.coordinates);
        this.drawControl.delete([removeFeature.id]).add(startingFeature);
        // work around delete() and add() not firing selection change event
        this._map.fire(DrawConstants.events.SELECTION_CHANGE, {
            features: [startingFeature]
        });
    }

    isSupportedFeatures(features) {
        return features.length == 2 && features.every((feature) => feature.geometry.type === DrawConstants.geojsonTypes.LINE_STRING);
    }

    setFeatures(features, state) {
        super.setFeatures(features);
        this.setFeaturesText(features, state);
        this._container.style.display = 'block';
    }

    setFeaturesText(features) {
        const unitName = DISTANCE_ABBRS[this.distanceUnits];
        const lineDistance = features.reduce((accumulator, feature) => accumulator + length(feature, {units: this.distanceUnits}), 0);
        this._textContainer.textContent = 'Multiple lines: ' +
            lineDistance.toLocaleString() + ' ' + unitName;
    }

}

export { LineStringInfoControl, MultiLineInfoControl, PointInfoControl };