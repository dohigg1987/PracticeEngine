export type Scalar=string|number|boolean|null;
export interface RuleContext{[key:string]:Scalar}
export interface Rule{code:string;sourceReference:string;when:{field:string;operator:"EQ"|"NE"|"GT"|"GTE"|"LT"|"LTE";value:Scalar};outcome:{type:"REQUIRE"|"WARN";target:string};}
export interface RuleResult{code:string;triggered:boolean;outcome?:Rule["outcome"];explanation:string}
function compare(actual:Scalar,op:Rule["when"]["operator"],expected:Scalar):boolean{switch(op){case"EQ":return actual===expected;case"NE":return actual!==expected;case"GT":return Number(actual)>Number(expected);case"GTE":return Number(actual)>=Number(expected);case"LT":return Number(actual)<Number(expected);case"LTE":return Number(actual)<=Number(expected);}}
export function evaluateRule(rule:Rule,context:RuleContext):RuleResult{const actual=context[rule.when.field]??null;const triggered=compare(actual,rule.when.operator,rule.when.value);return{code:rule.code,triggered,outcome:triggered?rule.outcome:undefined,explanation:`${rule.when.field}=${String(actual)} ${rule.when.operator} ${String(rule.when.value)}; source=${rule.sourceReference}`};}
