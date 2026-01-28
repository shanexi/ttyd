if (process.env.NODE_ENV === 'development') {
    require('preact/debug');
}
import 'whatwg-fetch';
import { h, render } from 'preact';
import { App } from './components/app';
import './style/tailwind.css';
import './style/index.scss';

render(<App />, document.body);
