import {forward} from '../../live-code-auth/upstream.js';
export default {fetch(request: Request) { return forward(request, true); }};
