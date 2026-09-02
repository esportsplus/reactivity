import { ts } from '@esportsplus/typescript';
import { uid } from '@esportsplus/typescript/compiler';


const COMPOUND_OPERATORS = new Map<ts.SyntaxKind, string>([
    [ts.SyntaxKind.AmpersandAmpersandEqualsToken, '&&'],
    [ts.SyntaxKind.AmpersandEqualsToken, '&'],
    [ts.SyntaxKind.AsteriskAsteriskEqualsToken, '**'],
    [ts.SyntaxKind.AsteriskEqualsToken, '*'],
    [ts.SyntaxKind.BarBarEqualsToken, '||'],
    [ts.SyntaxKind.BarEqualsToken, '|'],
    [ts.SyntaxKind.CaretEqualsToken, '^'],
    [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, '>>'],
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, '>>>'],
    [ts.SyntaxKind.LessThanLessThanEqualsToken, '<<'],
    [ts.SyntaxKind.MinusEqualsToken, '-'],
    [ts.SyntaxKind.PercentEqualsToken, '%'],
    [ts.SyntaxKind.PlusEqualsToken, '+'],
    [ts.SyntaxKind.QuestionQuestionEqualsToken, '??'],
    [ts.SyntaxKind.SlashEqualsToken, '/']
]);

const ENTRYPOINT = 'reactive';

const NAMESPACE = uid('reactivity');


const TYPES = {
    Array: 0,
    Computed: 1,
    Signal: 2
} as const;

type TYPES = typeof TYPES[keyof typeof TYPES];


export { COMPOUND_OPERATORS, ENTRYPOINT, NAMESPACE, TYPES };
export { PACKAGE_NAME } from '../constants';