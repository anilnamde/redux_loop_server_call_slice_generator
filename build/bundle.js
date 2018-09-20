'use strict';

var appConstants = require('ShelfPricing/constants/appConstants');
var reduxLoop = require('redux-loop');
var reselect = require('reselect');

var createReducer = (initialState, handlers) => (
    (state = initialState, action) => {
        if (Object.prototype.hasOwnProperty.call(handlers, action.type)) {
            return handlers[action.type](state, action);
        }
        return state;
    }
);

const defaultOptions = {
    sequence: false
};

const defaultActions = {
    actions: [],
    options: defaultOptions
};

const requestedDefault = Object.create(defaultActions);
const receivedDefault = Object.create(defaultActions);
const failedDefault = Object.create(defaultActions);

const actionGenerator = (actions, rootAction) => actions.map(action => reduxLoop.Cmd.action(action(rootAction)));
const extractHttpStatus = payload => ({ headers: payload.headers, statusText: payload.statusText, status: payload.status });

function reducerCreator({
                            actionPrefix,
                            requestHandler,
                            requested = requestedDefault,
                            received = receivedDefault,
                            rejected = failedDefault,
                            receivedDataTransformer = receivedData => ({ data: { ...receivedData } }),
                            initialState = {
                                data: {},
                                promiseState: appConstants.promiseStates.INIT,
                            }
                        }) {
    const requestActionHandler = (state, action) => {
        const { url, params, data } = action;
        return reduxLoop.loop(
            {
                ...state,
                promiseState: appConstants.promiseStates.PENDING,
            },
            reduxLoop.Cmd.list([
                reduxLoop.Cmd.run(requestHandler, {
                    successActionCreator: payload => ({
                        type: `${actionPrefix}_RECEIVED`,
                        payload
                    }),
                    failActionCreator: payload => ({
                        type: `${actionPrefix}_FAILED`,
                        payload,
                    }),
                    args: [url, params, data]
                }),
                ...actionGenerator(requested.actions, action)
            ], {
                ...requested.options
            }),
        );
    };

    const receivedActionHandler = (state, action) => {
        const transformedData = receivedDataTransformer(action.payload.data);
        const requestData = extractHttpStatus(action.payload);
        return reduxLoop.loop({
            ...state,
            ...transformedData,
            ...requestData,
            promiseState: appConstants.promiseStates.RESOLVED,
        }, reduxLoop.Cmd.list([
            ...actionGenerator(received.actions, action)
        ], {
            ...received.options
        }));
    };

    const resetActionHandler = state => ({
        ...state,
        ...initialState,
    });

    const failedActionHandler = (state, action) => {
        const requestData = extractHttpStatus(action.payload);
        return reduxLoop.loop({
            ...state,
            ...requestData,
            ...initialState,
            promiseState: appConstants.promiseStates.REJECTED,
        }, reduxLoop.Cmd.list([
            ...actionGenerator(rejected.actions, action)
        ], {
            ...rejected.options
        }));
    };

    return createReducer(
        initialState,
        {
            [`${actionPrefix}_REQUESTED`]: requestActionHandler,
            [`${actionPrefix}_RECEIVED`]: receivedActionHandler,
            [`${actionPrefix}_RESET`]: resetActionHandler,
            [`${actionPrefix}_FAILED`]: failedActionHandler,
        }
    );
}

var index = config => ({
    request: (url, params, data = {}) => ({
        type: `${config.actionPrefix}_REQUESTED`,
        url,
        params,
        data,
    }),
    reset: () => ({
        type: `${config.actionPrefix}_RESET`,
    }),
    reducer: reducerCreator(config),
    storeName: config.storeName,
    selector: config.selector || reselect.createSelector(
        state => state[config.storeName],
        componentState => ({
            ...componentState,
        })
    ),
});

module.exports = index;
