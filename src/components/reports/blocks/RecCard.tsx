interface Props {
  n: number;
  title: string;
  why: string;
  primary?: boolean;
}

export function RecCard({ n, title, why, primary }: Props) {
  return (
    <div className={`rr-rec${primary ? " p1" : ""}`}>
      <div className="rr-rec-n">{n}</div>
      <div>
        <div className="rr-rec-title">{title}</div>
        <div className="rr-rec-why">
          <b>Por qué</b>
          <span>{why}</span>
        </div>
      </div>
    </div>
  );
}