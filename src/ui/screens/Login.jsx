import "./Login.css";
import { useNavigate } from "react-router-dom";

const PLAYERS = ["Rony", "Nathaniel", "Jesse", "Eve"];

function Login({ onSelectPlayer }) {
	const navigate = useNavigate();

	return (
		<div className="login-screen">
			<div className="login-screen__panel">
				<h1 className="login-screen__title">Select Player</h1>
				<div className="login-screen__grid">
					{PLAYERS.map((name) => (
						<button
							key={name}
							className="login-screen__tile"
							onClick={() => {
								const slug = name.toLowerCase();
								onSelectPlayer?.(name);
								navigate(`/${slug}/army-selector`);
							}}
							type="button"
						>
							<span className="login-screen__name">{name}</span>
						</button>
					))}
				</div>
				<div className="login-screen__actions">
					<button
						className="login-screen__btn"
						type="button"
						onClick={() => navigate("/multiplayer")}
					>
						Multiplayer lobby
					</button>
				</div>
			</div>
		</div>
	);
}

export default Login;
