import createReducer from './lib/createReducer';
import { promiseStates } from 'ShelfPricing/constants/appConstants';
import { Cmd, loop } from 'redux-loop';
import { createSelector } from 'reselect';


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

const actionGenerator = (actions, rootAction) => actions.map(action => Cmd.action(action(rootAction)));
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
                                promiseState: promiseStates.INIT,
                            }
                        }) {
    const requestActionHandler = (state, action) => {
        const { url, params, data } = action;
        return loop(
            {
                ...state,
                promiseState: promiseStates.PENDING,
            },
            Cmd.list([
                Cmd.run(requestHandler, {
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
        return loop({
            ...state,
            ...transformedData,
            ...requestData,
            promiseState: promiseStates.RESOLVED,
        }, Cmd.list([
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
        return loop({
            ...state,
            ...requestData,
            ...initialState,
            promiseState: promiseStates.REJECTED,
        }, Cmd.list([
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

export default config => ({
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
    selector: config.selector || createSelector(
        state => state[config.storeName],
        componentState => ({
            ...componentState,
        })
    ),
});

