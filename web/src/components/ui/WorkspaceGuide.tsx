import { ModuleIcon } from './ModuleIcon';

interface WorkspaceGuideProps {
  module: 'finance' | 'team' | 'audit';
  title: string;
  description: string;
  steps: readonly { title: string; description: string }[];
}

/** Modülün mevcut işlemlerini açıklar; görev veya zorunluluk üretmez. */
export function WorkspaceGuide({ module, title, description, steps }: WorkspaceGuideProps) {
  return (
    <section className="ft-workspace-guide" aria-label={title}>
      <div className="ft-workspace-guide__intro">
        <span className="ft-workspace-guide__icon"><ModuleIcon name={module} /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      <ol className="ft-workspace-guide__steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="ft-workspace-guide__number" aria-hidden="true">0{index + 1}</span>
            <div><h3>{step.title}</h3><p>{step.description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
