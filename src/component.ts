import { Component, ComponentChild, Fragment, h } from 'preact';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { shallowEqual } from './util/shallowEqual';

class BassdrumComponent<P, S> extends Component<P, S> {
    propsStream: BehaviorSubject<P>;
    updates: Subject<P>;
    subscriptions: Subscription[];

    constructor(props: P, context: any) {
        super(props, context);
        this.propsStream = new BehaviorSubject(props);
        this.updates = new Subject();
        this.subscriptions = [];
        this.subscriptions.push(this.createSubscription());
    }

    createSubscription(): Subscription {
        return new Subscription();
    }

    componentDidMount() {
        this.updates.next(this.props);
    }

    componentWillReceiveProps(props: P) {
        this.propsStream.next(props);
    }

    shouldComponentUpdate(_: P, nextState: S) {
        return this.state !== nextState;
    }

    componentDidUpdate() {
        this.updates.next(this.props);
    }

    render(): ComponentChild {
        return h(Fragment, null);
    }

    componentWillUnmount() {
        this.propsStream.complete();
        this.updates.complete();
        this.subscriptions.forEach(sub => sub.unsubscribe());
        this.subscriptions.length = 0;
    }
}

export interface ComponentFunctionApi<P> {
    props: BehaviorSubject<P>;
    updates: Subject<P>;
    subscribe: (obs: Observable<any>) => void;
}

export type ComponentFunction<P, S> = (
    api: ComponentFunctionApi<P>,
) => Observable<S>;

export type ComponentTemplate<S> = (state: S) => ComponentChild;

/**
 * Creates the api for the component function
 * @param component The bassdrum component
 */
const createComponentAPI = <P, S>(
    component: BassdrumComponent<P, S>,
): ComponentFunctionApi<P> => ({
    props: component.propsStream,
    subscribe: (obs: Observable<unknown>) =>
        component.subscriptions.push(obs.subscribe()),
    updates: component.updates,
});

/**
 * Creates a bassdrum component
 * @param componentFunction The component function that receives the `props` and `updates` stream, and a subscribe function
 * @param template The template function that receives your state data and returns jsx
 */
export const createComponent = <P, S>(
    componentFunction: ComponentFunction<P, S>,
    template: ComponentTemplate<S>,
) =>
    class extends BassdrumComponent<P, S> {
        createSubscription(): Subscription {
            let hasEmitted = false;
            const subscription = componentFunction(createComponentAPI(this))
                .pipe(distinctUntilChanged(shallowEqual))
                .subscribe(state => {
                    hasEmitted = true;
                    this.setState(state);
                });
            if (process.env.NODE_ENV !== 'production') {
                if (!hasEmitted) {
                    throw new Error(
                        'Your Component did not emit any state when it was created. ' +
                            'Make sure the Observable you return from your ' +
                            'component function emits immediately.',
                    );
                }
            }
            return subscription;
        }
        render(): ComponentChild {
            return template(this.state);
        }
    };
