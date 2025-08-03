import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { useMessage } from '../MessageContext';
import Icon from './Icons';
import LoadingScreen from './LoadingScreen';
import { fetchUserCollections, createCollection } from '../requests';
import '../App.css';

export default function TournamentCreation() {
	const [selectedOption, setSelectedOption] = useState('select');
	const { isLoggedIn } = useContext(AuthContext);

	const handleOptionSelect = (type) => {
		setSelectedOption(type);
	};

	if (!isLoggedIn) {
		return (
			<div className="signin-warning">
				<h2 className="signin-warning-heading">Sign In required</h2>
				<p className="signin-warning-info">You need to be signed in to an account to be able to create a tournament.</p>
				<p className="signin-warning-info">
					Please log into your account, or if you are new here you can create an account - it's completely free.
				</p>
				<div className="signin-warning-button">
					<Link to="/login" className="cta-button">
						Sign In
					</Link>
				</div>
			</div>
		);
	}

	return (
		<>
			{selectedOption === 'select' && (
				<div className="creation-container">
					<h2>Create Tournament</h2>
					<div className="creation-options">
						<div className="creation-option" onClick={() => handleOptionSelect('template')}>
							<svg className="option-icon" viewBox="0 0 24 24">
								<path d="M19,3H5C3.89,3 3,3.89 3,5V19C3,20.11 3.89,21 5,21H19C20.11,21 21,20.11 21,19V5C21,3.89 20.11,3 19,3M19,19H5V5H19V19M17,17H7V7H17V17M15,15H9V9H15V15M13,13H11V11H13V13Z" />
							</svg>
							<h3>Use Template</h3>
							<p>Choose from pre-configured tournament formats for quick setup</p>
						</div>

						<div className="creation-option disabled" title="Coming Soon!">
							<div className="coming-soon-badge">Coming Soon</div>
							<svg className="option-icon" viewBox="0 0 24 24">
								<path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
							</svg>
							<h3>Custom Tournament</h3>
							<p>Create a tournament with your own custom settings and format</p>
						</div>
					</div>
				</div>
			)}
			{selectedOption === 'template' && <CreateFromTemplate goBack={() => setSelectedOption('select')} />}
		</>
	);
}

function CreateFromTemplate({ goBack }) {
	const [tournamentData, setTournamentData] = useState({
		template: '',
		details: {
			name: '',
			date: '',
			location: '',
			description: '',
			collection: '',
		},
		structure: {
			numTeams: '0',
			numGroups: '0',
			knockoutRound: '0',
		},
		teams: [],
	});
	const [showSummary, setShowSummary] = useState(false);
	const [expandedSections, setExpandedSections] = useState(new Set([0]));
	const summaryRef = useRef(null);
	const hasFetchedCollections = useRef(false);
	const { showMessage } = useMessage();
	const [structureFields, setStructureFields] = useState([
		{
			type: 'int',
			name: 'Number of Teams',
			required: true,
			id: 'numTeams',
		},
	]);
	const [collectionOptions, setCollectionOptions] = useState([
		{ name: 'None', value: '' },
		{ name: 'Add to new collection', value: 'new' },
	]);
	const [showCollectionPopup, setShowCollectionPopup] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchCollections = async () => {
			try {
				const response = await fetchUserCollections();
				if (response.success) {
					setCollectionOptions((prev) => {
						const newList = [...prev];
						response.message.forEach((collection) => {
							newList.push({ name: collection.name, value: collection.id });
						});
						return newList;
					});
				}
			} catch (error) {
				showMessage('Error fetching collections. Please try again later', 'error');
			}
		};
		if (hasFetchedCollections.current) return;
		hasFetchedCollections.current = true;
		fetchCollections();
	}, []);

	const toggleContent = (index) => {
		setExpandedSections((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			return newSet;
		});
	};

	const toggleSummary = () => {
		const content = summaryRef.current;

		if (!content) return;

		if (showSummary) {
			content.style.maxHeight = '600px';
			requestAnimationFrame(() => {
				content.style.maxHeight = '40px';
			});
		} else {
			content.style.maxHeight = '600px';
		}

		setShowSummary(!showSummary);
	};

	const handleReset = () => {
		setTournamentData({
			template: '',
			details: {
				name: '',
				date: '',
				location: '',
				description: '',
				collection: '',
			},
			structure: {
				numTeams: '0',
				numGroups: '0',
				knockoutRound: '0',
			},
			teams: [],
		});
	};

	const selectTemplate = (template) => {
		if (template === 'Classic') {
			setStructureFields((prev) => [
				...prev,
				{
					type: 'combo',
					options: [
						{
							type: 'int',
							name: 'Number of Groups',
							required: false,
							id: 'numGroups',
							weight: 1,
						},
						{
							type: 'selection',
							name: 'First Knockout Round',
							required: true,
							id: 'knockoutRound',
							options: [
								{ name: 'Round of 24', value: 24 },
								{ name: 'Round of 16', value: 16 },
								{ name: 'Round of 12', value: 12 },
								{ name: 'Quarterfinal', value: 8 },
								{ name: 'Semifinal', value: 4 },
								{ name: 'Final', value: 2 },
							],
							weight: 1,
						},
					],
				},
			]);
		} else {
			setStructureFields([
				{
					type: 'int',
					name: 'Number of Teams',
					required: true,
					id: 'numTeams',
					value: tournamentData.structure.numTeams,
				},
			]);
		}

		setTournamentData((prev) => {
			return { ...prev, template: template };
		});
	};

	const updateDetails = (e) => {
		const { id, value } = e.target;
		if (id === 'collection') {
			if (value === 'new') {
				//open collection popup
				setShowCollectionPopup(true);
			}
		}

		setTournamentData((prev) => ({
			...prev,
			details: {
				...prev.details,
				[id]: value,
			},
		}));
	};

	const updateStructure = (e) => {
		const { id, value } = e.target;
		// console.log({ id, value });
		setTournamentData((prev) => ({
			...prev,
			structure: {
				...prev.structure,
				[id]: value,
			},
		}));
	};

	const mapStructureValues = () => {
		const mappedFields = structureFields.map((field) => {
			if (field.type === 'combo') {
				const options = field.options.map((option) => {
					const value = tournamentData.structure[option.id] ?? '';
					return { ...option, value };
				});
				return { ...field, options };
			}
			const value = tournamentData.structure[field.id] ?? '';
			return { ...field, value };
		});
		return mappedFields;
	};

	useEffect(() => {
		document.body.style.overflow = showCollectionPopup ? 'hidden' : 'auto';
	}, [showCollectionPopup]);

	const addNewCollection = async (collection) => {
		try {
			setLoading(true);
			const response = await createCollection(collection);
			if (response.success) {
				const id = response.message;
				setCollectionOptions((prev) => [...prev, { name: collection, value: id }]);
				setTournamentData((prev) => ({
					...prev,
					details: {
						...prev.details,
						collection: id,
					},
				}));
			}
		} catch (error) {
			showMessage('Failed to add a new collection. Please try again later', 'error');
		} finally {
			setLoading(false);
			setShowCollectionPopup(false);
		}
	};

	return (
		<>
			{showCollectionPopup && (
				<NewCollectionPopup
					onClose={() => {
						setShowCollectionPopup(false);
						setTournamentData((prev) => ({
							...prev,
							details: {
								...prev.details,
								collection: '',
							},
						}));
					}}
					onSubmit={(name) => {
						addNewCollection(name);
					}}
					collectionList={collectionOptions}
				/>
			)}
			{loading && <LoadingScreen />}
			<h2 className="create-form-heading">Create Tournament from Template</h2>
			<div className="create-form-container">
				<div className="create-form-inputs">
					<InputSection
						title={'Choose Template'}
						fields={[{ type: 'template-card', name: 'template' }]}
						index={0}
						toggleContent={toggleContent}
						expandedSections={expandedSections}
						updateAction={selectTemplate}
						tournamentData={tournamentData}
					/>
					<InputSection
						title={'Tournament Details'}
						fields={[
							{
								type: 'combo',
								name: 'Tournament Name and Collection',
								options: [
									{
										type: 'string',
										name: 'Tournament Name',
										required: true,
										id: 'name',
										value: tournamentData.details.name,
										weight: 3,
									},
									{
										type: 'selection',
										name: 'Collection',
										id: 'collection',
										required: false,
										value: tournamentData.details.collection,
										options: collectionOptions,
										weight: 2,
									},
								],
							},
							{
								type: 'combo',
								name: 'Location and Date combination',
								options: [
									{
										type: 'string',
										name: 'Tournament Location',
										required: true,
										id: 'location',
										value: tournamentData.details.location,
										weight: 3,
									},
									{
										type: 'date',
										name: 'Starting Date',
										required: true,
										id: 'date',
										value: tournamentData.details.date,
										weight: 1,
									},
								],
							},
							{
								type: 'string',
								name: 'Description',
								required: false,
								id: 'description',
								value: tournamentData.details.description,
							},
						]}
						index={1}
						toggleContent={toggleContent}
						expandedSections={expandedSections}
						updateAction={updateDetails}
						tournamentData={tournamentData}
					/>
					<InputSection
						title={'Tournament Structure'}
						fields={mapStructureValues()}
						index={2}
						toggleContent={toggleContent}
						expandedSections={expandedSections}
						updateAction={updateStructure}
						tournamentData={tournamentData}
					/>
				</div>
			</div>
			<div className="create-form-floating-actions-bar">
				<div className={`create-form-progress`} ref={summaryRef}>
					<div
						className="create-form-progress-expandable"
						onClick={toggleSummary}
						title={showSummary ? 'Close Summary' : 'Show Summary'}>
						<Icon name={showSummary ? 'doubleArrowDown' : 'doubleArrowUp'} className="create-form-progress-expand" />
						<h3>{showSummary ? 'Summary' : 'View Summary'}</h3>
						<Icon name={showSummary ? 'doubleArrowDown' : 'doubleArrowUp'} className="create-form-progress-expand" />
					</div>
					<div className={`create-form-progress-summary`}>
						<SummaryPage fields={tournamentData} collections={collectionOptions} />
					</div>
				</div>
				<div className="create-form-floating-actions">
					<div className="create-form-floating-action secondary" onClick={goBack}>
						Back
					</div>
					<div className="create-form-floating-action-group">
						<div className="create-form-floating-action tertiary" onClick={handleReset}>
							Reset
						</div>
						<div className="create-form-floating-action">Submit</div>
					</div>
				</div>
			</div>
			<div
				className={`create-form-progress-summary-filter ${showSummary ? 'active' : ''}`}
				onClick={toggleSummary}></div>
		</>
	);
}

function InputSection({ title, fields, index, toggleContent, expandedSections, updateAction, tournamentData }) {
	const generateFields = (fieldList) => {
		return fieldList.map((field, i) => {
			// console.log(field);
			if (field.type === 'template-card') {
				return <React.Fragment key={`${index}${i}`}>{generateTemplateCards()}</React.Fragment>;
			}
			if (field.type === 'string') {
				return <React.Fragment key={`${index}${i}`}>{generateTextInput(field)}</React.Fragment>;
			}
			if (field.type === 'date') {
				return <React.Fragment key={`${index}${i}`}>{generateDateInput(field)}</React.Fragment>;
			}
			if (field.type === 'int') {
				return <React.Fragment key={`${index}${i}`}>{generateNumericInput(field)}</React.Fragment>;
			}
			if (field.type === 'selection') {
				return <React.Fragment key={`${index}${i}`}>{generateSelectionInput(field)}</React.Fragment>;
			}
			if (field.type === 'combo') {
				return <React.Fragment key={`${index}${i}`}>{generateComboInput(field)}</React.Fragment>;
			}
		});
	};

	const generateTemplateCards = () => {
		return (
			<div className="create-form-template-cards">
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'Single Elimination' ? 'active' : ''}`}
					onClick={() => updateAction('Single Elimination')}>
					Single Elimination
				</div>
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'League' ? 'active' : ''}`}
					onClick={() => updateAction('League')}>
					League
				</div>
				<div
					className={`create-form-template-card ${tournamentData['template'] === 'Classic' ? 'active' : ''}`}
					onClick={() => updateAction('Classic')}>
					Classic
				</div>
			</div>
		);
	};

	const generateComboInput = (details) => {
		const columnRatios = details.options.map((field) => `${field.weight}fr`).join(' ');

		return (
			<div className="create-form-input-element-combo" style={{ gridTemplateColumns: columnRatios }}>
				{generateFields(details.options)}
			</div>
		);
	};

	const generateTextInput = (details) => {
		return (
			<div className="create-form-input-element">
				<label htmlFor={details.id}>{details.name}</label>
				<input
					type="text"
					id={details.id}
					required={details.required}
					value={details.value}
					onChange={updateAction}
					className="create-form-input-element-type text"></input>
			</div>
		);
	};

	const generateNumericInput = (details) => {
		return (
			<div className="create-form-input-element">
				<label htmlFor={details.id}>{details.name}</label>
				<input
					type="number"
					required={details.required}
					min={1}
					id={details.id}
					value={details.value ?? ''}
					onChange={updateAction}
					className="create-form-input-element-type numeric"></input>
			</div>
		);
	};

	const generateSelectionInput = (details) => {
		return (
			<div className="create-form-input-element">
				<label htmlFor={details.id}>{details.name}</label>
				<select
					id={details.id}
					required={details.required}
					value={details.value}
					onChange={updateAction}
					className="create-form-input-element-type select">
					{details.options.map((opt, i) => {
						return (
							<option value={opt.value} key={i}>
								{opt.name}
							</option>
						);
					})}
				</select>
			</div>
		);
	};

	const generateDateInput = (details) => {
		return (
			<div className="create-form-input-element">
				<label htmlFor={details.id}>{details.name}</label>
				<input
					type="date"
					required={details.required}
					id={details.id}
					value={details.value}
					onChange={updateAction}
					className="create-form-input-element-type date"></input>
			</div>
		);
	};

	// console.log(generateFields());

	return (
		<div className="create-form-input-section">
			<div
				className={`input-section-expandable ${expandedSections.has(index) ? 'active' : ''}`}
				onClick={() => toggleContent(index)}>
				{title}
				{expandedSections.has(index) ? (
					<Icon name={'doubleArrowUp'} className="create-form-input-expand" />
				) : (
					<Icon name={'doubleArrowDown'} className="create-form-input-expand" />
				)}
			</div>
			<div className={`input-section-expandable-content ${expandedSections.has(index) ? 'expand' : ''}`}>
				{generateFields(fields)}
			</div>
		</div>
	);
}

function SummaryPage({ fields, collections }) {
	const knockoutRoundMap = {
		24: 'Round of 24',
		16: 'Round of 16',
		12: 'Round of 12',
		8: 'Quarterfinal',
		4: 'Semifinal',
		2: 'Final',
	};

	const collectionMap = {};
	collections.forEach((collection) => {
		collectionMap[collection.value] = collection.name;
	});

	return (
		<div className="new-tournament-summary">
			{fields['template'] && (
				<div className="new-tournament-summary-section">
					<h3>Chosen Template</h3>
					<p>{fields['template']}</p>
				</div>
			)}
			{fields['details'] && (
				<div className="new-tournament-summary-section">
					<h3>Tournament Details</h3>
					<sub>* required</sub>
					<div className="tournament-summary-section-fields">
						<div className="tournament-summary-section-fields-row">
							<h4>Name*</h4>
							<p>{fields.details.name || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Date*</h4>
							<p>{fields.details.date || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Location*</h4>
							<p>{fields.details.location || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Description</h4>
							<p>{fields.details.description || '-'}</p>
						</div>
						<div className="tournament-summary-section-fields-row">
							<h4>Collection</h4>
							<p>{collectionMap[fields.details.collection] || 'None'}</p>
						</div>
					</div>
				</div>
			)}
			{fields['structure'] && (
				<div className="new-tournament-summary-section">
					<h3>Tournament Structure</h3>
					<sub>*required</sub>
					<div className="tournament-summary-section-fields">
						<div className="tournament-summary-section-fields-row">
							<h4>Number of Teams*</h4>
							<p>{parseInt(fields.structure.numTeams) || '-'}</p>
						</div>
						{fields.template === 'Classic' && (
							<>
								<div className="tournament-summary-section-fields-row">
									<h4>Number of Groups*</h4>
									<p>{parseInt(fields.structure.numGroups) || '-'}</p>
								</div>
								<div className="tournament-summary-section-fields-row">
									<h4>First Knockout Phase*</h4>
									<p>{knockoutRoundMap[parseInt(fields.structure.knockoutRound)] || '-'}</p>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function NewCollectionPopup({ onClose, onSubmit, collectionList }) {
	const [newCollectionName, setNewCollectionName] = useState('');
	const { showMessage } = useMessage();

	const handleClickOutside = (e) => {
		if (e.target.className === 'new-collection-popup-container') {
			onClose();
		}
	};

	const handleChange = (e) => {
		setNewCollectionName(e.target.value);
	};

	const handleSubmit = () => {
		if (!collectionList.some((collection) => collection.name.toLowerCase() === newCollectionName.toLowerCase())) {
			onSubmit(newCollectionName);
		} else {
			showMessage('Collection with that name already exists', 'error');
		}
	};

	return (
		<div className="new-collection-popup-container" onClick={handleClickOutside}>
			<div className="new-collection-popup">
				<div className="new-collection-popup-content">
					<h2 className="new-collection-popup-heading">Create new Collection</h2>
					<div className="new-collection-popup-form">
						<label htmlFor="newCollection">Collection Name</label>
						<input type="text" id="newCollection" value={newCollectionName} onChange={handleChange}></input>
					</div>
					<div className="new-collection-popup-actions">
						<div className="new-collection-popup-action close" onClick={onClose}>
							Close
						</div>
						<div className="new-collection-popup-action submit" onClick={handleSubmit}>
							Submit
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
